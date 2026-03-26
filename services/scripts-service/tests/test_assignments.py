import pytest
import uuid
from tests.conftest import VALID_STEPS, TEST_ORG_ID


async def _create_template(client, name=None, scope="org_level"):
    resp = await client.post("/api/v1/scripts/templates", json={
        "name": name or f"Script {uuid.uuid4()}",
        "scope": scope,
        "steps": VALID_STEPS,
    })
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_assign_script(director_client):
    """SCRIPTS-I-07: assign script to seller → 201"""
    client, _ = director_client
    template_id = await _create_template(client)
    seller_id = str(uuid.uuid4())

    resp = await client.post("/api/v1/scripts/assignments", json={
        "seller_id": seller_id,
        "template_id": template_id,
        "is_mandatory": False,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["seller_id"] == seller_id
    assert data["template_id"] == template_id


@pytest.mark.asyncio
async def test_duplicate_assignment(director_client):
    """SCRIPTS-I-08: duplicate assignment → 409"""
    client, _ = director_client
    template_id = await _create_template(client)
    seller_id = str(uuid.uuid4())

    await client.post("/api/v1/scripts/assignments", json={
        "seller_id": seller_id,
        "template_id": template_id,
        "is_mandatory": False,
    })
    resp = await client.post("/api/v1/scripts/assignments", json={
        "seller_id": seller_id,
        "template_id": template_id,
        "is_mandatory": False,
    })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_manager_cannot_assign_other_org_template(other_org_client, director_client):
    """SCRIPTS-I-15: cannot assign template from another org → 403"""
    dir_client, _ = director_client
    template_id = await _create_template(dir_client)

    other_client, _ = other_org_client
    resp = await other_client.post("/api/v1/scripts/assignments", json={
        "seller_id": str(uuid.uuid4()),
        "template_id": template_id,
        "is_mandatory": False,
    })
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_assignment(director_client):
    """SCRIPTS-I-10: delete assignment → 204"""
    client, _ = director_client
    template_id = await _create_template(client)
    seller_id = str(uuid.uuid4())

    assign_resp = await client.post("/api/v1/scripts/assignments", json={
        "seller_id": seller_id,
        "template_id": template_id,
        "is_mandatory": False,
    })
    assignment_id = assign_resp.json()["id"]

    del_resp = await client.delete(f"/api/v1/scripts/assignments/{assignment_id}")
    assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_for_seller_returns_active_scripts(director_client):
    """SCRIPTS-I-11: GET /for-seller returns all active scripts for seller"""
    client, user = director_client
    template_id = await _create_template(client, name=f"Seller Script {uuid.uuid4()}")
    seller_id = str(uuid.uuid4())
    org_id = user["organization_id"]

    await client.post("/api/v1/scripts/assignments", json={
        "seller_id": seller_id,
        "template_id": template_id,
        "is_mandatory": True,
    })

    resp = await client.get(f"/api/v1/scripts/for-seller?seller_id={seller_id}&organization_id={org_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["seller_id"] == seller_id
    assert len(data["scripts"]) >= 1
    script = next(s for s in data["scripts"] if s["id"] == template_id)
    assert script["is_mandatory"] is True
    assert len(script["steps"]) == 3


@pytest.mark.asyncio
async def test_for_seller_empty(director_client):
    """SCRIPTS-I-12: seller without scripts → empty list"""
    client, user = director_client
    seller_id = str(uuid.uuid4())
    org_id = user["organization_id"]

    resp = await client.get(f"/api/v1/scripts/for-seller?seller_id={seller_id}&organization_id={org_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["scripts"] == []


@pytest.mark.asyncio
async def test_for_seller_excludes_inactive(director_client):
    """SCRIPTS-I-14: GET /for-seller does NOT return inactive templates"""
    client, user = director_client
    template_id = await _create_template(client, name=f"Inactive Script {uuid.uuid4()}")
    seller_id = str(uuid.uuid4())
    org_id = user["organization_id"]

    await client.post("/api/v1/scripts/assignments", json={
        "seller_id": seller_id,
        "template_id": template_id,
        "is_mandatory": False,
    })

    # Deactivate
    await client.patch(f"/api/v1/scripts/templates/{template_id}", json={"is_active": False})

    resp = await client.get(f"/api/v1/scripts/for-seller?seller_id={seller_id}&organization_id={org_id}")
    assert resp.status_code == 200
    ids = [s["id"] for s in resp.json()["scripts"]]
    assert template_id not in ids


@pytest.mark.asyncio
async def test_for_seller_mandatory_flag(director_client):
    """SCRIPTS-I-16/18: is_mandatory flag is preserved"""
    client, user = director_client
    template_id = await _create_template(client, name=f"Mandatory Script {uuid.uuid4()}")
    seller_id = str(uuid.uuid4())
    org_id = user["organization_id"]

    await client.post("/api/v1/scripts/assignments", json={
        "seller_id": seller_id,
        "template_id": template_id,
        "is_mandatory": True,
    })

    resp = await client.get(f"/api/v1/scripts/for-seller?seller_id={seller_id}&organization_id={org_id}")
    script = next(s for s in resp.json()["scripts"] if s["id"] == template_id)
    assert script["is_mandatory"] is True


@pytest.mark.asyncio
async def test_for_seller_context_description(director_client):
    """SCRIPTS-I-17: context_description is returned for contextual scripts"""
    client, user = director_client
    ctx_desc = "Apply when selling smartphones and tablets"

    resp = await client.post("/api/v1/scripts/templates", json={
        "name": f"Contextual Script {uuid.uuid4()}",
        "scope": "org_level",
        "context_description": ctx_desc,
        "steps": VALID_STEPS,
    })
    template_id = resp.json()["id"]
    seller_id = str(uuid.uuid4())
    org_id = user["organization_id"]

    await client.post("/api/v1/scripts/assignments", json={
        "seller_id": seller_id,
        "template_id": template_id,
        "is_mandatory": False,
    })

    resp = await client.get(f"/api/v1/scripts/for-seller?seller_id={seller_id}&organization_id={org_id}")
    script = next(s for s in resp.json()["scripts"] if s["id"] == template_id)
    assert script["context_description"] == ctx_desc
