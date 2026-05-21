"""Terminal49 v2 API client — thin wrapper.

Reads TERMINAL49_API_TOKEN from env. All functions raise T49Error on non-2xx.

Auth: Authorization: Token <TOKEN>
Content-Type: application/vnd.api+json
Docs: https://developers.terminal49.com/
"""
import json
import os
from typing import Optional

import requests

BASE = "https://api.terminal49.com/v2"
TIMEOUT = 25


class T49Error(Exception):
    pass


def is_configured() -> bool:
    return bool(os.environ.get("TERMINAL49_API_TOKEN"))


def _headers():
    tok = os.environ.get("TERMINAL49_API_TOKEN")
    if not tok:
        raise T49Error("TERMINAL49_API_TOKEN is not set")
    return {
        "Authorization": f"Token {tok}",
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
    }


class T49DuplicateError(T49Error):
    """T49 returned 422 'duplicate' — existing tracking_request_id is in `request_id`."""
    def __init__(self, message: str, request_id: Optional[str] = None):
        super().__init__(message)
        self.request_id = request_id


def create_tracking_request(number: str, scac: Optional[str] = None,
                            request_type: str = "bill_of_lading") -> dict:
    """Submit a container # or MBL to T49 for tracking.

    request_type: 'bill_of_lading' (preferred) or 'container' or 'booking_number'
    scac:         4-letter ocean carrier SCAC (e.g. 'MAEU', 'MSCU', 'ONEY')

    Raises T49DuplicateError when T49 says the reference is already enrolled —
    the existing tracking_request_id is on the exception's `request_id`.
    """
    attrs = {"request_type": request_type, "request_number": number}
    if scac:
        attrs["scac"] = scac
    body = {"data": {"type": "tracking_request", "attributes": attrs}}
    r = requests.post(f"{BASE}/tracking_requests", headers=_headers(),
                      data=json.dumps(body), timeout=TIMEOUT)
    if r.status_code in (200, 201, 202):
        return r.json()
    # Try to parse a duplicate error and pull out the existing tracking_request_id
    try:
        err = r.json()
        for e in err.get("errors", []) or []:
            if (e.get("code") == "duplicate"):
                existing_id = ((e.get("meta") or {}).get("tracking_request_id"))
                raise T49DuplicateError(
                    f"create_tracking_request 422 duplicate: existing tracking_request_id={existing_id}",
                    request_id=existing_id,
                )
    except T49DuplicateError:
        raise
    except Exception:
        pass
    raise T49Error(f"create_tracking_request {r.status_code}: {r.text[:400]}")


def get_tracking_request(req_id: str) -> dict:
    r = requests.get(f"{BASE}/tracking_requests/{req_id}",
                     headers=_headers(), timeout=TIMEOUT)
    if r.status_code != 200:
        raise T49Error(f"get_tracking_request {r.status_code}: {r.text[:400]}")
    return r.json()


def find_existing_tracking_request(request_number: str, scac: Optional[str] = None) -> Optional[dict]:
    """Find an existing tracking_request matching a request_number (+ optional SCAC).

    Returns the first matching tracking_request object (jsonapi `data`) or None.
    Used when create_tracking_request returns 422 duplicate.
    """
    params = {"filter[request_number]": request_number, "page[size]": 25}
    r = requests.get(f"{BASE}/tracking_requests", headers=_headers(),
                     params=params, timeout=TIMEOUT)
    if r.status_code != 200:
        return None
    items = (r.json() or {}).get("data") or []
    if scac:
        items = [i for i in items
                 if (i.get("attributes") or {}).get("scac", "").upper() == scac.upper()] or items
    return items[0] if items else None


def find_shipment_by_reference(request_number: str) -> Optional[dict]:
    """Lookup a shipment by container # / BOL / booking #. Returns first shipment data dict or None."""
    for filter_key in ("filter[number]", "filter[bill_of_lading_number]", "filter[booking_number]"):
        params = {filter_key: request_number, "page[size]": 25}
        r = requests.get(f"{BASE}/shipments", headers=_headers(),
                         params=params, timeout=TIMEOUT)
        if r.status_code == 200:
            items = (r.json() or {}).get("data") or []
            if items:
                return items[0]
    return None


def get_shipment(shipment_id: str) -> dict:
    """Shipment + containers + transport_events + ports inlined."""
    params = {
        "include": "containers,containers.transport_events,port_of_lading,"
                   "port_of_discharge,pod_terminal"
    }
    r = requests.get(f"{BASE}/shipments/{shipment_id}",
                     headers=_headers(), params=params, timeout=TIMEOUT)
    if r.status_code != 200:
        raise T49Error(f"get_shipment {r.status_code}: {r.text[:400]}")
    return r.json()


def parse_milestones(shipment_resp: dict, container_no: str) -> dict:
    """Pull our container's milestones + summary fields out of a T49 shipment payload.

    Returns: {milestones: [{event, location, timestamp, actual}, ...],
              pod_eta, pod_name, last_event, last_event_at}
    """
    included = shipment_resp.get("included", []) or []
    evt_map = {i["id"]: i for i in included if i.get("type") == "transport_event"}

    cont = None
    for inc in included:
        if inc.get("type") == "container":
            num = (inc.get("attributes") or {}).get("number") or ""
            if num.upper() == container_no.upper():
                cont = inc
                break

    event_ids = []
    if cont:
        rel = (cont.get("relationships") or {}).get("transport_events") or {}
        event_ids = [d.get("id") for d in (rel.get("data") or [])]
    if not event_ids:
        ship = shipment_resp.get("data") or {}
        rel = (ship.get("relationships") or {}).get("transport_events") or {}
        event_ids = [d.get("id") for d in (rel.get("data") or [])]

    milestones = []
    for eid in event_ids:
        e = evt_map.get(eid)
        if not e:
            continue
        a = e.get("attributes") or {}
        milestones.append({
            "event": a.get("event"),
            "location": a.get("location_locode") or a.get("location_name"),
            "timestamp": a.get("timestamp"),
            "voyage_number": a.get("voyage_number"),
            "actual": a.get("actual"),
        })
    milestones.sort(key=lambda m: m.get("timestamp") or "")

    ship_attrs = (shipment_resp.get("data") or {}).get("attributes") or {}
    pod_eta = ship_attrs.get("pod_eta_at") or ship_attrs.get("pod_eta")

    pod_name = None
    pod_rel = ((shipment_resp.get("data") or {}).get("relationships") or {}).get("port_of_discharge") or {}
    pod_id = (pod_rel.get("data") or {}).get("id")
    if pod_id:
        for inc in included:
            if inc.get("type") == "port" and inc.get("id") == pod_id:
                pod_name = (inc.get("attributes") or {}).get("name")
                break

    last = milestones[-1] if milestones else {}
    return {
        "milestones": milestones,
        "pod_eta": pod_eta,
        "pod_name": pod_name,
        "last_event": last.get("event"),
        "last_event_at": last.get("timestamp"),
    }
