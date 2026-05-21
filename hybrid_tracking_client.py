"""Hybrid tracking provider — mock first, ShipsGo fallback for unknowns.

Use when you want the 5 demo references to render perfectly (no API calls,
no credits burned) but also want the tool to handle real container numbers
Alex might type. Falls back to ShipsGo only when SHIPSGO_API_TOKEN is set
AND the ref passes basic format validation (so random garbage doesn't burn
credits).

Enable via TRACKING_PROVIDER=hybrid.
"""
import os
import re
from typing import Optional

import mock_tracking_client as _mock

try:
    import shipsgo_tracking_client as _shipsgo
    _SHIPSGO_AVAILABLE = True
except Exception:
    _shipsgo = None
    _SHIPSGO_AVAILABLE = False

# Re-export the exception types so app.py can catch them uniformly
T49Error = _mock.T49Error
T49DuplicateError = _mock.T49DuplicateError


_MOCK_FIXTURE_KEYS = set(_mock._FIXTURES.keys())


def is_configured() -> bool:
    # Hybrid is always usable because mock is always available.
    return True


def _shipsgo_ready() -> bool:
    return _SHIPSGO_AVAILABLE and bool(os.environ.get("SHIPSGO_API_TOKEN"))


# ISO 6346 alpha-to-numeric (skips 11/22/33 to avoid the forbidden digits)
_ISO6346_VALS = {
    'A': 10, 'B': 12, 'C': 13, 'D': 14, 'E': 15, 'F': 16, 'G': 17, 'H': 18,
    'I': 19, 'J': 20, 'K': 21, 'L': 23, 'M': 24, 'N': 25, 'O': 26, 'P': 27,
    'Q': 28, 'R': 29, 'S': 30, 'T': 31, 'U': 32, 'V': 34, 'W': 35, 'X': 36,
    'Y': 37, 'Z': 38,
}


def _is_valid_iso6346(num: str) -> bool:
    """Validate ISO 6346 container number check digit (4 letters + 7 digits)."""
    num = (num or "").strip().upper()
    if not re.match(r"^[A-Z]{4}\d{7}$", num):
        return False
    total = 0
    for i, ch in enumerate(num[:10]):
        v = _ISO6346_VALS.get(ch) if ch.isalpha() else int(ch)
        if v is None:
            return False
        total += v * (2 ** i)
    return (total % 11) % 10 == int(num[10])


def _looks_like_mbl_or_booking(ref: str) -> bool:
    """Permissive check — alphanumeric, 8–20 chars."""
    return bool(re.match(r"^[A-Z0-9]{8,20}$", (ref or "").strip().upper()))


def _ref_burnable(ref: str, request_type: str) -> bool:
    """Should we spend a ShipsGo credit looking this up?"""
    ref_u = (ref or "").strip().upper()
    if request_type == "container":
        return _is_valid_iso6346(ref_u)
    return _looks_like_mbl_or_booking(ref_u)


def _demo_set_message() -> str:
    return ("Not in the demo set. Try one of: CMDUSHZ7959898, TLLU4779831, "
            "ZCSU7238990, NYKU0776734, KOCU4970299 — or configure "
            "SHIPSGO_API_TOKEN on Render to track arbitrary references live.")


def _wrap_shipsgo_call(fn, *args, **kwargs):
    """Call into shipsgo_tracking_client and re-raise its exceptions using
    the hybrid (mock-namespaced) types so app.py's except clauses catch them."""
    try:
        return fn(*args, **kwargs)
    except _shipsgo.T49DuplicateError as e:
        raise T49DuplicateError(str(e), request_id=getattr(e, "request_id", None)) from e
    except _shipsgo.T49Error as e:
        raise T49Error(str(e)) from e


def create_tracking_request(number, scac=None, request_type="bill_of_lading"):
    ref_u = (number or "").upper()
    # 1) Mock fixture path — free, deterministic
    if ref_u in _MOCK_FIXTURE_KEYS:
        return _mock.create_tracking_request(number, scac=scac, request_type=request_type)

    # 2) Unknown ref — try ShipsGo if we have a key AND ref looks valid
    if _shipsgo_ready() and _ref_burnable(number, request_type):
        return _wrap_shipsgo_call(_shipsgo.create_tracking_request,
                                  number, scac=scac, request_type=request_type)

    # 3) Neither path available — explain to the user
    if _shipsgo_ready():
        raise T49Error(
            f"'{number}' isn't a valid ocean reference format. Use a real "
            f"container # (ISO 6346) or master BOL."
        )
    raise T49Error(_demo_set_message())


def get_tracking_request(req_id):
    # Mock request_ids are uuid5(ref); ShipsGo request_ids are integers/strings.
    # If the id looks like a UUID, hit mock; otherwise hit ShipsGo.
    if re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", str(req_id)):
        return _mock.get_tracking_request(req_id)
    if _shipsgo_ready():
        return _wrap_shipsgo_call(_shipsgo.get_tracking_request, req_id)
    return _mock.get_tracking_request(req_id)


def get_shipment(shipment_id):
    sid = str(shipment_id or "")
    if sid.startswith("shp-"):
        return _mock.get_shipment(shipment_id)
    if _shipsgo_ready():
        return _wrap_shipsgo_call(_shipsgo.get_shipment, shipment_id)
    return _mock.get_shipment(shipment_id)


def parse_milestones(shipment_resp, container_no):
    ref_u = (container_no or "").upper()
    if ref_u in _MOCK_FIXTURE_KEYS:
        return _mock.parse_milestones(shipment_resp, container_no)
    # If the shipment response carries a ShipsGo raw blob, use ShipsGo's parser
    if isinstance(shipment_resp, dict) and shipment_resp.get("_shipsgo_raw") and _SHIPSGO_AVAILABLE:
        return _shipsgo.parse_milestones(shipment_resp, container_no)
    return _mock.parse_milestones(shipment_resp, container_no)


def find_existing_tracking_request(request_number, scac=None):
    return None


def find_shipment_by_reference(request_number):
    return None
