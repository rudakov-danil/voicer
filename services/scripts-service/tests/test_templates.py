import pytest
import uuid
from tests.conftest import VALID_STEPS, TEST_ORG_ID, TEST_USER_ID, TEST_MANAGER_ID


@pytest.mark.asyncio
async def test_manager_cannot_create_org_level(manager_client):
    """SCRIPTS-I-01: manager + scope=org_level → 403"""
    client, _ = manager_client
    resp = await client.post("/api/v1/scripts/templates", json={
        "name": "Org Script",
        "scope": "org_level",
        "steps": VALID_STEPS,
    })
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_manager_can_create_manager_level(manager_client):
    """SCRIPTS-I-02: manager + scope=manager_level → 201"""
    client, _ = manager_client
    resp = await client.post("/api/v1/scripts/templates", json={
        "name": f"Manager Script {uuid.uuid4()}",
        "scope": "manager_level",
        "steps": VALID_STEPS,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["scope"] == "manager_level"


@pytest.mark.asyncio
async def test_invalid_weights(director_client):
    """SCRIPTS-I-03: invalid weights → 422 with INVALID_WEIGHTS"""
    client, _ = director_client
    resp = await client.post("/api/v1/scripts/templates", json={
        "name": "Bad Script",
        "scope": "org_level",
        "steps": [
            {"name": "Step1", "weight": 0.30, "is_required": True, "step_order": 1},
            {"name": "Step2", "weight": 0.30, "is_required": True, "step_order": 2},
        ],
    })
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "INVALID_WEIGHTS"


@pytest.mark.asyncio
async def test_manager_cannot_see_other_manager_scripts(manager_client, director_client):
    """SCRIPTS-I-04: manager does NOT see another manager's manager_level scripts"""
    dir_client, dir_payload = director_client
    # Create org-level script as director (different created_by than manager)
    resp = await dir_client.post("/api/v1/scripts/templates", json={
        "name": f"Director Manager-Level Script {uuid.uuid4()}",
        "scope": "manager_level",
        "steps": VALID_STEPS,
    })
    assert resp.status_code == 201
    template_id = resp.json()["id"]

    # Manager should NOT see this (created_by != manager's sub)
    mgr_client, _ = manager_client
    get_resp = await mgr_client.get(f"/api/v1/scripts/templates/{template_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_manager_sees_org_level_and_own_scripts(manager_client, director_client):
    """SCRIPTS-I-05: manager sees org_level + own manager_level"""
    dir_client, _ = director_client
    mgr_client, mgr_payload = manager_client

    # Create org-level script as director
    org_name = f"Org Script {uuid.uuid4()}"
    resp1 = await dir_client.post("/api/v1/scripts/templates", json={
        "name": org_name,
        "scope": "org_level",
        "steps": VALID_STEPS,
    })
    assert resp1.status_code == 201

    # Create manager_level as manager
    mgr_name = f"Mgr Own Script {uuid.uuid4()}"
    resp2 = await mgr_client.post("/api/v1/scripts/templates", json={
        "name": mgr_name,
        "scope": "manager_level",
        "steps": VALID_STEPS,
    })
    assert resp2.status_code == 201

    # List as manager
    list_resp = await mgr_client.get("/api/v1/scripts/templates")
    assert list_resp.status_code == 200
    names = [item["name"] for item in list_resp.json()["items"]]
    assert org_name in names
    assert mgr_name in names


@pytest.mark.asyncio
async def test_director_sees_all_scripts(director_client, manager_client):
    """SCRIPTS-I-06: director sees all templates in org"""
    dir_client, dir_payload = director_client
    mgr_client, _ = manager_client

    name1 = f"Dir Script {uuid.uuid4()}"
    name2 = f"Mgr Script {uuid.uuid4()}"

    await dir_client.post("/api/v1/scripts/templates", json={"name": name1, "scope": "org_level", "steps": VALID_STEPS})
    await mgr_client.post("/api/v1/scripts/templates", json={"name": name2, "scope": "manager_level", "steps": VALID_STEPS})

    list_resp = await dir_client.get("/api/v1/scripts/templates")
    assert list_resp.status_code == 200
    names = [item["name"] for item in list_resp.json()["items"]]
    assert name1 in names
    assert name2 in names


@pytest.mark.asyncio
async def test_patch_deactivate(director_client):
    """SCRIPTS-I-13: PATCH is_active=false deactivates template"""
    client, _ = director_client
    resp = await client.post("/api/v1/scripts/templates", json={
        "name": f"Active Script {uuid.uuid4()}",
        "scope": "org_level",
        "steps": VALID_STEPS,
    })
    assert resp.status_code == 201
    template_id = resp.json()["id"]

    patch_resp = await client.patch(f"/api/v1/scripts/templates/{template_id}", json={"is_active": False})
    assert patch_resp.status_code == 200
    assert patch_resp.json()["is_active"] is False
