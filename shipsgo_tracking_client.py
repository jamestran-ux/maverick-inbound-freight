"""ShipsGo Ocean API v1.2 client.

Same interface as terminal49_client / mock_tracking_client so app.py can swap
providers via TRACKING_PROVIDER env. Endpoints discovered from the official
v1.2 PDF + the open-source Soer-BV PHP client.

Base:    https://shipsgo.com/api/v1.2/ContainerService/
Auth:    `authCode` query/form param (your ShipsGo API key)
Content: application/x-www-form-urlencoded on POST, JSON on GET response

ENDPOINTS USED
  POST /PostCustomContainerForm          — track by container #
  POST /PostCustomContainerFormWithBl    — track by Master BOL
  GET  /GetContainerInfo?requestId=X     — fetch voyage data (request id, container # or BOL)

CREDIT MODEL: 1 credit per unique container tracked. All milestones for that
voyage are then free. Free signup gives 3 credits.
"""
import os
from typing import Optional

import requests

BASE = "https://shipsgo.com/api/v1.2/ContainerService"
TIMEOUT = 25


class T49Error(Exception):
    pass


class T49DuplicateError(T49Error):
    """ShipsGo says 'Container already exists' — request_id will be set to the existing reference."""
    def __init__(self, message: str, request_id: Optional[str] = None):
        super().__init__(message)
        self.request_id = request_id


def is_configured() -> bool:
    return bool(os.environ.get("SHIPSGO_API_TOKEN"))


def _auth():
    tok = os.environ.get("SHIPSGO_API_TOKEN")
    if not tok:
        raise T49Error("SHIPSGO_API_TOKEN is not set")
    return tok


def _post(endpoint: str, fields: dict):
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }
    fields = {"authCode": _auth(), **{k: v for k, v in fields.items() if v}}
    r = requests.post(f"{BASE}/{endpoint}", headers=headers, data=fields, timeout=TIMEOUT)
    return r


def _get_voyage_raw(request_id_or_ref: str, map_point: bool = True) -> dict:
    params = {"authCode": _auth(), "requestId": request_id_or_ref}
    if map_point:
        params["mapPoint"] = "true"
    r = requests.get(f"{BASE}/GetContainerInfo/", params=params,
                     headers={"Accept": "application/json"}, timeout=TIMEOUT)
    if r.status_code != 200:
        raise T49Error(f"GetContainerInfo {r.status_code}: {r.text[:400]}")
    try:
        body = r.json()
    except Exception:
        raise T49Error(f"GetContainerInfo non-JSON: {r.text[:400]}")
    # API returns a list with one element OR a single object depending on shape
    if isinstance(body, list):
        if not body:
            raise T49Error("GetContainerInfo: empty list")
        return body[0]
    return body


def create_tracking_request(number: str, scac: Optional[str] = None,
                            request_type: str = "bill_of_lading") -> dict:
    """ShipsGo equivalent of T49 create. Returns a T49-shaped envelope.

    Strategy: try GET first (free if container is already tracked → no credit charged).
    If that fails, POST (charges 1 credit). Maps ShipsGo response into the T49 JSON:API
    shape so app.py can stay provider-agnostic.
    """
    # 1. Try fetching first — free if it exists, avoids burning a credit on duplicates
    try:
        existing = _get_voyage_raw(number, map_point=True)
        # Existing record found — synthesize a duplicate error so the route fetches it via GET path
        rid = existing.get("RequestId") or existing.get("Reference") or existing.get("ContainerNumber") or number
        raise T49DuplicateError(
            f"ShipsGo: '{number}' already tracked (RequestId={rid})",
            request_id=str(rid),
        )
    except T49DuplicateError:
        raise
    except T49Error:
        pass  # Not yet tracked — fall through and POST

    # 2. POST a new tracking request
    if request_type == "bill_of_lading":
        endpoint = "PostCustomContainerFormWithBl"
        fields = {"blContainersRef": number, "shippingLine": scac or "OTHERS"}
    else:
        endpoint = "PostCustomContainerForm"
        fields = {"containerNumber": number, "shippingLine": scac or "OTHERS"}

    r = _post(endpoint, fields)
    if r.status_code not in (200, 201, 204):
        msg = f"{endpoint} {r.status_code}: {r.text[:400]}"
        # ShipsGo sometimes returns 200 with text body "Container already exists"
        if "already exist" in r.text.lower():
            raise T49DuplicateError(msg, request_id=number)
        raise T49Error(msg)

    # Successful POST returns the integer request id (sometimes wrapped in JSON, sometimes raw text)
    body_text = (r.text or "").strip().strip('"')
    if "already exist" in body_text.lower():
        raise T49DuplicateError(body_text, request_id=number)
    rid = body_text
    return {
        "data": {
            "id": rid,
            "type": "tracking_request",
            "attributes": {
                "status": "pending",
                "request_type": request_type,
                "request_number": number,
                "scac": scac,
            },
            "relationships": {
                "tracked_object": {"data": {"type": "shipment", "id": rid}},
            },
        }
    }


def get_tracking_request(req_id: str) -> dict:
    """ShipsGo doesn't expose a separate 'tracking_request' resource — GetContainerInfo
    serves both purposes. We return a T49-shaped envelope so app.py is happy."""
    body = _get_voyage_raw(req_id, map_point=True)
    return {
        "data": {
            "id": str(req_id),
            "type": "tracking_request",
            "attributes": {"status": "succeeded"},
            "relationships": {"tracked_object": {"data": {"type": "shipment", "id": str(req_id)}}},
        },
        "_shipsgo_raw": body,
    }


def get_shipment(shipment_id: str) -> dict:
    """ShipsGo's voyage data is the 'shipment' equivalent. We return the raw JSON in `included`
    keyed for parse_milestones to consume."""
    body = _get_voyage_raw(shipment_id, map_point=True)
    return {
        "data": {"id": str(shipment_id), "type": "shipment", "attributes": body},
        "included": [],
        "_shipsgo_raw": body,
    }


def _pick(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


def parse_milestones(shipment_resp: dict, container_no: str) -> dict:
    """Map ShipsGo's response to our T49-shaped milestone list.

    ShipsGo's voyage payload commonly includes a list of movements/events with
    fields like Event/Location/Date/IsActual. Field names vary between
    container vs BL responses, so we do best-effort lookups on multiple aliases.
    """
    raw = shipment_resp.get("_shipsgo_raw") or (shipment_resp.get("data") or {}).get("attributes") or {}

    movements = (raw.get("Movements") or raw.get("ContainerMovements")
                 or raw.get("Events") or raw.get("MovementsList") or [])

    milestones = []
    for m in movements:
        evt = _pick(m, "Event", "EventName", "Status", "Description")
        loc = _pick(m, "Location", "Port", "LocationName")
        ts  = _pick(m, "Date", "EventDate", "Timestamp", "ActualDate", "EstimatedDate")
        actual = _pick(m, "IsActual", "Actual")
        if isinstance(actual, str):
            actual = actual.lower() in ("true", "yes", "1")
        milestones.append({
            "event": evt or "—",
            "location": loc,
            "timestamp": ts,
            "actual": actual,
            "voyage_number": _pick(m, "Voyage", "VoyageNumber"),
        })

    # Best-effort sort by timestamp (string-comparable ISO)
    milestones.sort(key=lambda x: x.get("timestamp") or "")

    pod_name = _pick(raw, "Pod", "PortOfDischarge", "POD", "Destination", "DestinationPort")
    pod_eta  = _pick(raw, "ArrivalDate", "ETAAtPod", "ETA", "EstimatedTimeOfArrival")
    last = milestones[-1] if milestones else {}

    return {
        "milestones": milestones,
        "pod_eta": pod_eta,
        "pod_name": pod_name,
        "last_event": last.get("event"),
        "last_event_at": last.get("timestamp"),
    }


def find_existing_tracking_request(request_number, scac=None):
    # ShipsGo doesn't expose a list endpoint with filters — GetContainerInfo by ref handles it
    try:
        body = _get_voyage_raw(request_number, map_point=False)
        rid = body.get("RequestId") or body.get("Reference") or request_number
        return {"id": str(rid), "type": "tracking_request",
                "attributes": {"status": "succeeded"},
                "relationships": {"tracked_object": {"data": {"type": "shipment", "id": str(rid)}}}}
    except T49Error:
        return None


def find_shipment_by_reference(request_number):
    try:
        body = _get_voyage_raw(request_number, map_point=False)
        return {"id": str(request_number), "type": "shipment", "attributes": body}
    except T49Error:
        return None
