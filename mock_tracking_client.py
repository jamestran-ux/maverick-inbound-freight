"""Mock tracking provider — returns realistic Terminal49-shaped responses.

Used for demos and offline development. Same JSON:API shape as
terminal49_client so the rest of the app is provider-agnostic.

Enabled via env: TRACKING_PROVIDER=mock (default).
Swap to real T49: TRACKING_PROVIDER=terminal49 + TERMINAL49_API_TOKEN.
Future: TRACKING_PROVIDER=shipsgo + SHIPSGO_API_TOKEN.
"""
import uuid
from typing import Optional


class T49Error(Exception):
    pass


class T49DuplicateError(T49Error):
    def __init__(self, message: str, request_id: Optional[str] = None):
        super().__init__(message)
        self.request_id = request_id


def is_configured() -> bool:
    return True


# Hand-crafted realistic timelines for the 5 demo references.
# (event, location, ISO timestamp, actual=True / estimated=False)
_FIXTURES = {
    "CMDUSHZ7959898": {
        "scac": "CMDU", "carrier": "CMA CGM",
        "vessel": "CMA CGM AMERIGO VESPUCCI",
        "port_of_lading": ("CNSHA", "Shanghai, China"),
        "port_of_discharge": ("USLGB", "Long Beach, CA"),
        "pod_eta": "2026-05-26T18:00:00Z",
        "milestones": [
            ("Empty container released to shipper", "Shanghai, China",   "2026-05-08T02:15:00Z", True),
            ("Gate in at port of lading",           "Shanghai, China",   "2026-05-10T11:42:00Z", True),
            ("Loaded onto vessel",                  "Shanghai, China",   "2026-05-11T22:30:00Z", True),
            ("Vessel departed",                     "Shanghai, China",   "2026-05-12T08:00:00Z", True),
            ("In transit",                          "North Pacific",     "2026-05-17T00:00:00Z", True),
            ("Vessel arrival (estimated)",          "Long Beach, CA",    "2026-05-26T18:00:00Z", False),
            ("Discharged from vessel (estimated)",  "Long Beach, CA",    "2026-05-27T06:00:00Z", False),
        ],
    },
    "ZCSU7238990": {
        "scac": "ZIMU", "carrier": "ZIM",
        "vessel": "ZIM USA",
        "port_of_lading": ("CNYTN", "Yantian, China"),
        "port_of_discharge": ("USNYC", "New York, NY"),
        "pod_eta": "2026-05-30T14:00:00Z",
        "milestones": [
            ("Empty container released to shipper", "Yantian, China",       "2026-05-05T08:00:00Z", True),
            ("Loaded onto vessel",                  "Yantian, China",       "2026-05-07T15:00:00Z", True),
            ("Vessel departed",                     "Yantian, China",       "2026-05-08T02:30:00Z", True),
            ("Transshipment loaded",                "Singapore",            "2026-05-12T19:00:00Z", True),
            ("Transshipment discharged",            "Cartagena, Colombia",  "2026-05-22T11:00:00Z", True),
            ("In transit",                          "Caribbean Sea",        "2026-05-24T00:00:00Z", True),
            ("Vessel arrival (estimated)",          "New York, NY",         "2026-05-30T14:00:00Z", False),
        ],
    },
    "NYKU0776734": {
        "scac": "ONEY", "carrier": "ONE (ex-NYK)",
        "vessel": "ONE COMMITMENT",
        "port_of_lading": ("JPYOK", "Yokohama, Japan"),
        "port_of_discharge": ("USTIW", "Tacoma, WA"),
        "pod_eta": "2026-05-22T09:30:00Z",
        "milestones": [
            ("Loaded onto vessel",      "Yokohama, Japan", "2026-05-12T03:00:00Z", True),
            ("Vessel departed",         "Yokohama, Japan", "2026-05-12T11:00:00Z", True),
            ("In transit",              "North Pacific",   "2026-05-17T00:00:00Z", True),
            ("Vessel arrival",          "Tacoma, WA",      "2026-05-22T09:30:00Z", True),
            ("Discharged from vessel",  "Tacoma, WA",      "2026-05-22T16:00:00Z", True),
            ("Gate out (intermodal, estimated)", "Tacoma, WA", "2026-05-23T08:30:00Z", False),
        ],
    },
    "KOCU4970299": {
        "scac": "ONEY", "carrier": "K Line (ONE)",
        "vessel": "ONE TRUST",
        "port_of_lading": ("KRPUS", "Busan, South Korea"),
        "port_of_discharge": ("USLGB", "Long Beach, CA"),
        "pod_eta": "2026-05-18T22:00:00Z",
        "milestones": [
            ("Loaded onto vessel",                  "Busan, South Korea", "2026-05-04T18:00:00Z", True),
            ("Vessel departed",                     "Busan, South Korea", "2026-05-05T03:00:00Z", True),
            ("Vessel arrival",                      "Long Beach, CA",     "2026-05-18T22:00:00Z", True),
            ("Discharged from vessel",              "Long Beach, CA",     "2026-05-19T05:30:00Z", True),
            ("Available for pickup · LFD 2026-05-23", "Long Beach, CA",   "2026-05-19T18:00:00Z", True),
            ("Gate out to drayage (estimated)",     "Long Beach, CA",     "2026-05-21T07:15:00Z", False),
            ("Delivered to consignee (estimated)",  "Perris, CA · NewAge DC", "2026-05-21T13:45:00Z", False),
        ],
    },
    "TLLU4779831": {
        "scac": "HLCU", "carrier": "Hapag-Lloyd",
        "vessel": "AL JMELIYAH",
        "port_of_lading": ("DEHAM", "Hamburg, Germany"),
        "port_of_discharge": ("USNYC", "New York, NY"),
        "pod_eta": "2026-05-28T07:00:00Z",
        "milestones": [
            ("Empty container released",       "Hamburg, Germany", "2026-05-09T09:00:00Z", True),
            ("Gate in at port of lading",      "Hamburg, Germany", "2026-05-11T14:00:00Z", True),
            ("Loaded onto vessel",             "Hamburg, Germany", "2026-05-13T22:00:00Z", True),
            ("Vessel departed",                "Hamburg, Germany", "2026-05-14T05:30:00Z", True),
            ("In transit",                     "North Atlantic",   "2026-05-19T00:00:00Z", True),
            ("Vessel arrival (estimated)",     "New York, NY",     "2026-05-28T07:00:00Z", False),
        ],
    },
}


def _generic(ref):
    return {
        "scac": "MAEU", "carrier": "Maersk (mock)",
        "vessel": "MAERSK ESSEN",
        "port_of_lading": ("CNSHA", "Shanghai, China"),
        "port_of_discharge": ("USLGB", "Long Beach, CA"),
        "pod_eta": "2026-06-01T12:00:00Z",
        "milestones": [
            ("Loaded onto vessel",         "Shanghai, China", "2026-05-14T12:00:00Z", True),
            ("Vessel departed",            "Shanghai, China", "2026-05-15T03:00:00Z", True),
            ("In transit",                 "Pacific Ocean",   "2026-05-19T00:00:00Z", True),
            ("Vessel arrival (estimated)", "Long Beach, CA",  "2026-06-01T12:00:00Z", False),
        ],
    }


def _fixture_for(ref):
    return _FIXTURES.get((ref or "").upper()) or _generic(ref)


def _request_id(ref):
    """Deterministic per-ref UUID so subsequent calls return the same id."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, "mock-" + (ref or "").upper()))


def create_tracking_request(number, scac=None, request_type="bill_of_lading"):
    rid = _request_id(number)
    fix = _fixture_for(number)
    return {
        "data": {
            "id": rid,
            "type": "tracking_request",
            "attributes": {
                "status": "succeeded",
                "request_type": request_type,
                "request_number": number,
                "scac": scac or fix["scac"],
            },
            "relationships": {
                "tracked_object": {"data": {"type": "shipment", "id": "shp-" + rid}},
            },
        }
    }


def get_tracking_request(req_id):
    return {
        "data": {
            "id": req_id,
            "type": "tracking_request",
            "attributes": {"status": "succeeded"},
            "relationships": {
                "tracked_object": {"data": {"type": "shipment", "id": "shp-" + req_id}},
            },
        }
    }


def get_shipment(shipment_id):
    # Stub — actual milestone lookup happens in parse_milestones via container_no
    return {
        "data": {"id": shipment_id, "type": "shipment", "attributes": {}},
        "included": [],
    }


def parse_milestones(shipment_resp, container_no):
    fix = _fixture_for(container_no)
    milestones = [
        {"event": evt, "location": loc, "timestamp": ts, "actual": actual,
         "voyage_number": None}
        for (evt, loc, ts, actual) in fix["milestones"]
    ]
    last = milestones[-1] if milestones else {}
    return {
        "milestones": milestones,
        "pod_eta": fix.get("pod_eta"),
        "pod_name": fix["port_of_discharge"][1],
        "last_event": last.get("event"),
        "last_event_at": last.get("timestamp"),
    }


def find_existing_tracking_request(request_number, scac=None):
    return None


def find_shipment_by_reference(request_number):
    return None
