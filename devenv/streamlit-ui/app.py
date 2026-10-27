"""
Meridian Rewards - Chapter 7 reference UI (Streamlit)

Login on this screen calls POST /auth/login on the Node.js API, which
introspects the token against the Okta mock (WireMock) and returns a
role-bearing session token. Every subsequent screen in this app is
rendered based on that role, and every subsequent API call carries the
session token as a bearer credential, so role establishment happens
exactly once, at login, exactly as Section 7.6 describes.

In production, "Okta token" below is not typed by the user, it is
produced by a real Okta-hosted login redirect (OIDC authorization code
flow) that this app performs instead of accepting free text. See
Section 7.8 / docs/production-notes.md for that flow. The dev/demo
shortcut used here trades that realism for a login screen that runs
with zero external dependencies beyond WireMock.
"""

import os
import requests
import streamlit as st

API_BASE_URL = os.environ.get("REWARDS_API_BASE_URL", "http://localhost:4000")

DEMO_TOKENS = {
    "Employee": "demo-employee-token",
    "Manager": "demo-manager-token",
    "Administrator": "demo-admin-token",
    "Auditor": "demo-auditor-token",
}

st.set_page_config(page_title="Meridian Rewards", page_icon=":coin:", layout="centered")


def login_screen():
    st.title("Meridian Rewards")
    st.caption("Sign in to continue (dev/demo login backed by the Okta mock)")

    role_choice = st.selectbox("Sign in as", list(DEMO_TOKENS.keys()))

    if st.button("Sign in", type="primary"):
        try:
            resp = requests.post(
                f"{API_BASE_URL}/auth/login",
                json={"oktaToken": DEMO_TOKENS[role_choice]},
                timeout=5,
            )
            resp.raise_for_status()
            session = resp.json()
            st.session_state["session_token"] = session["sessionToken"]
            st.session_state["user_id"] = session["userId"]
            st.session_state["role"] = session["role"]
            st.session_state["region"] = session["region"]
            st.rerun()
        except requests.RequestException as e:
            st.error(f"Login failed: {e}")


def api_headers():
    return {"Authorization": f"Bearer {st.session_state['session_token']}"}


def employee_view():
    st.header("My rewards")
    employee_id = st.session_state["user_id"]

    resp = requests.get(f"{API_BASE_URL}/redemptions/balance", headers=api_headers(), timeout=5)
    if resp.ok:
        st.metric("Current balance (points)", resp.json()["balance"])

    st.subheader("Redeem a gift card")
    sku = st.text_input("Reward SKU", value="gc-amzn-25")
    quantity = st.number_input("Quantity", min_value=1, max_value=5, value=1)
    if st.button("Redeem"):
        resp = requests.post(
            f"{API_BASE_URL}/redemptions/giftcard",
            headers=api_headers(),
            json={"sku": sku, "quantity": quantity},
            timeout=15,
        )
        if resp.ok:
            st.success(resp.json())
        else:
            st.error(resp.json())

    st.subheader("My award history")
    resp = requests.get(f"{API_BASE_URL}/awards/{employee_id}/history", headers=api_headers(), timeout=5)
    if resp.ok:
        st.json(resp.json())


def manager_view():
    st.header("Manager: discretionary awards")
    employee_id = st.text_input("Employee pseudonymous reference (employee_ref)")
    reason_code = st.text_input("Reason code", value="great-work")
    points = st.number_input("Points", min_value=1, max_value=5000, value=100)

    if st.button("Issue award"):
        resp = requests.post(
            f"{API_BASE_URL}/awards/manager",
            headers=api_headers(),
            json={"employeeId": employee_id, "reasonCode": reason_code, "points": points},
            timeout=10,
        )
        if resp.ok:
            st.success(resp.json())
        else:
            st.error(resp.json())


def administrator_view():
    st.header("Administrator")

    st.subheader("Run automated awards (WF-2)")
    if st.button("Process qualifying Workday events now"):
        resp = requests.post(f"{API_BASE_URL}/awards/automated/run", headers=api_headers(), timeout=15)
        st.write(resp.json() if resp.ok else resp.text)

    st.subheader("Prepare a balance correction (WF-7, step 1 of 2)")
    employee_id = st.text_input("Employee reference to correct")
    delta = st.number_input("Points delta (can be negative)", value=0, step=1)
    reason = st.text_area("Reason for correction")
    if st.button("Prepare correction"):
        resp = requests.post(
            f"{API_BASE_URL}/corrections",
            headers=api_headers(),
            json={"employeeId": employee_id, "pointsDelta": delta, "reason": reason},
            timeout=10,
        )
        st.write(resp.json() if resp.ok else resp.text)
        st.info("A DIFFERENT administrator must now approve this correction id below.")

    st.subheader("Approve a pending correction (WF-7, step 2 of 2)")
    correction_id = st.text_input("Correction id to approve")
    if st.button("Approve correction"):
        resp = requests.post(
            f"{API_BASE_URL}/corrections/{correction_id}/approve",
            headers=api_headers(),
            timeout=10,
        )
        st.write(resp.json() if resp.ok else resp.text)


def auditor_view():
    st.header("Auditor: read-only history lookup")
    employee_id = st.text_input("Employee reference to inspect")
    if st.button("Fetch history"):
        resp = requests.get(f"{API_BASE_URL}/awards/{employee_id}/history", headers=api_headers(), timeout=10)
        st.json(resp.json() if resp.ok else {"error": resp.text})


def main():
    if "session_token" not in st.session_state:
        login_screen()
        return

    with st.sidebar:
        st.write(f"Signed in as **{st.session_state['role']}**")
        st.write(f"Region: {st.session_state['region']}")
        if st.button("Sign out"):
            st.session_state.clear()
            st.rerun()

    role = st.session_state["role"]
    if role == "employee":
        employee_view()
    elif role == "manager":
        manager_view()
    elif role == "administrator":
        administrator_view()
    elif role == "auditor":
        auditor_view()
    else:
        st.error("Unrecognized role.")


if __name__ == "__main__":
    main()
