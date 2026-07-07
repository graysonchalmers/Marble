#include <box3d/box3d.h>
#include <box3d/collision.h>
#include <emscripten/emscripten.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

#define MARBLE_BOX3D_BRIDGE_VERSION 1

typedef struct MarbleBox3DBridgeWorld
{
    b3WorldId worldId;
    b3HeightFieldData* hfs[8];
    int hfCount;
} MarbleBox3DBridgeWorld;

typedef struct MarbleBox3DBody
{
    b3BodyId bodyId;
} MarbleBox3DBody;

static b3Vec3 marble_vec3(float x, float y, float z)
{
    b3Vec3 value = { x, y, z };
    return value;
}

EMSCRIPTEN_KEEPALIVE
int marble_box3d_bridge_version(void)
{
    return MARBLE_BOX3D_BRIDGE_VERSION;
}

EMSCRIPTEN_KEEPALIVE
int marble_box3d_bridge_health(void)
{
    return 1;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t marble_box3d_world_create(float gravityX, float gravityY, float gravityZ)
{
    MarbleBox3DBridgeWorld* bridgeWorld = malloc(sizeof(MarbleBox3DBridgeWorld));
    if (bridgeWorld == NULL)
    {
        return 0;
    }

    b3WorldDef worldDef = b3DefaultWorldDef();
    worldDef.gravity = marble_vec3(gravityX, gravityY, gravityZ);
    worldDef.workerCount = 1;

    bridgeWorld->worldId = b3CreateWorld(&worldDef);
    bridgeWorld->hfCount = 0;
    for (int i = 0; i < 8; i++) {
        bridgeWorld->hfs[i] = NULL;
    }

    if (b3World_IsValid(bridgeWorld->worldId) == false)
    {
        free(bridgeWorld);
        return 0;
    }

    return (uintptr_t)bridgeWorld;
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_world_destroy(uintptr_t worldPtr)
{
    MarbleBox3DBridgeWorld* bridgeWorld = (MarbleBox3DBridgeWorld*)worldPtr;
    if (bridgeWorld == NULL)
    {
        return;
    }

    if (b3World_IsValid(bridgeWorld->worldId))
    {
        b3DestroyWorld(bridgeWorld->worldId);
    }

    for (int i = 0; i < bridgeWorld->hfCount; i++) {
        if (bridgeWorld->hfs[i]) {
            b3DestroyHeightField(bridgeWorld->hfs[i]);
        }
    }

    free(bridgeWorld);
}

EMSCRIPTEN_KEEPALIVE
int marble_box3d_world_step(uintptr_t worldPtr, float dt, int subSteps)
{
    MarbleBox3DBridgeWorld* bridgeWorld = (MarbleBox3DBridgeWorld*)worldPtr;
    if (bridgeWorld == NULL || b3World_IsValid(bridgeWorld->worldId) == false)
    {
        return 0;
    }

    b3World_Step(bridgeWorld->worldId, dt, subSteps > 0 ? subSteps : 4);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t marble_box3d_create_static_box(uintptr_t worldPtr, float x, float y, float z, float hx, float hy, float hz, float friction, float restitution)
{
    MarbleBox3DBridgeWorld* bridgeWorld = (MarbleBox3DBridgeWorld*)worldPtr;
    if (bridgeWorld == NULL || b3World_IsValid(bridgeWorld->worldId) == false)
    {
        return 0;
    }

    b3BodyDef bodyDef = b3DefaultBodyDef();
    bodyDef.type = b3_staticBody;
    bodyDef.position = marble_vec3(x, y, z);

    b3BodyId bodyId = b3CreateBody(bridgeWorld->worldId, &bodyDef);
    if (b3Body_IsValid(bodyId) == false)
    {
        return 0;
    }

    b3BoxHull boxHull = b3MakeBoxHull(hx, hy, hz);
    b3ShapeDef shapeDef = b3DefaultShapeDef();
    shapeDef.baseMaterial.friction = friction;
    shapeDef.baseMaterial.restitution = restitution;

    b3ShapeId shapeId = b3CreateHullShape(bodyId, &shapeDef, &boxHull.base);
    if (b3Shape_IsValid(shapeId) == false)
    {
        b3DestroyBody(bodyId);
        return 0;
    }

    MarbleBox3DBody* body = malloc(sizeof(MarbleBox3DBody));
    if (body == NULL)
    {
        b3DestroyBody(bodyId);
        return 0;
    }
    body->bodyId = bodyId;
    return (uintptr_t)body;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t marble_box3d_create_dynamic_sphere(uintptr_t worldPtr, float x, float y, float z, float radius, float density, float friction, float restitution)
{
    MarbleBox3DBridgeWorld* bridgeWorld = (MarbleBox3DBridgeWorld*)worldPtr;
    if (bridgeWorld == NULL || b3World_IsValid(bridgeWorld->worldId) == false)
    {
        return 0;
    }

    b3BodyDef bodyDef = b3DefaultBodyDef();
    bodyDef.type = b3_dynamicBody;
    bodyDef.position = marble_vec3(x, y, z);

    b3BodyId bodyId = b3CreateBody(bridgeWorld->worldId, &bodyDef);
    if (b3Body_IsValid(bodyId) == false)
    {
        return 0;
    }

    b3Sphere sphere = { 0 };
    sphere.center = marble_vec3(0.0f, 0.0f, 0.0f);
    sphere.radius = radius;

    b3ShapeDef shapeDef = b3DefaultShapeDef();
    shapeDef.density = density > 0.0f ? density : 1.0f;
    shapeDef.baseMaterial.friction = friction;
    shapeDef.baseMaterial.restitution = restitution;

    b3ShapeId shapeId = b3CreateSphereShape(bodyId, &shapeDef, &sphere);
    if (b3Shape_IsValid(shapeId) == false)
    {
        b3DestroyBody(bodyId);
        return 0;
    }

    b3Body_ApplyMassFromShapes(bodyId);

    MarbleBox3DBody* body = malloc(sizeof(MarbleBox3DBody));
    if (body == NULL)
    {
        b3DestroyBody(bodyId);
        return 0;
    }
    body->bodyId = bodyId;
    return (uintptr_t)body;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t marble_box3d_create_heightfield(uintptr_t worldPtr, float* heights, int countX, int countZ, float scaleX, float scaleY, float scaleZ, float minHeight, float maxHeight, float friction, float restitution)
{
    MarbleBox3DBridgeWorld* bridgeWorld = (MarbleBox3DBridgeWorld*)worldPtr;
    if (bridgeWorld == NULL || b3World_IsValid(bridgeWorld->worldId) == false || heights == NULL)
    {
        return 0;
    }

    b3HeightFieldDef hfDef = { 0 };
    hfDef.heights = heights;
    hfDef.countX = countX;
    hfDef.countZ = countZ;
    hfDef.scale = marble_vec3(scaleX, scaleY, scaleZ);
    hfDef.globalMinimumHeight = minHeight;
    hfDef.globalMaximumHeight = maxHeight;
    hfDef.clockwiseWinding = false;
    hfDef.materialIndices = NULL;

    b3HeightFieldData* hfData = b3CreateHeightField(&hfDef);
    if (hfData == NULL)
    {
        return 0;
    }

    if (bridgeWorld->hfCount < 8)
    {
        bridgeWorld->hfs[bridgeWorld->hfCount++] = hfData;
    }

    b3BodyDef bodyDef = b3DefaultBodyDef();
    bodyDef.type = b3_staticBody;
    bodyDef.position = marble_vec3(0.0f, 0.0f, 0.0f);

    b3BodyId bodyId = b3CreateBody(bridgeWorld->worldId, &bodyDef);
    if (b3Body_IsValid(bodyId) == false)
    {
        bridgeWorld->hfCount--;
        b3DestroyHeightField(hfData);
        return 0;
    }

    b3ShapeDef shapeDef = b3DefaultShapeDef();
    shapeDef.baseMaterial.friction = friction;
    shapeDef.baseMaterial.restitution = restitution;

    b3ShapeId shapeId = b3CreateHeightFieldShape(bodyId, &shapeDef, hfData);
    if (b3Shape_IsValid(shapeId) == false)
    {
        bridgeWorld->hfCount--;
        b3DestroyBody(bodyId);
        b3DestroyHeightField(hfData);
        return 0;
    }

    MarbleBox3DBody* body = malloc(sizeof(MarbleBox3DBody));
    if (body == NULL)
    {
        bridgeWorld->hfCount--;
        b3DestroyBody(bodyId);
        b3DestroyHeightField(hfData);
        return 0;
    }
    body->bodyId = bodyId;
    return (uintptr_t)body;
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_body_destroy(uintptr_t bodyPtr)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body == NULL)
    {
        return;
    }
    free(body);
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_body_apply_torque(uintptr_t bodyPtr, float tx, float ty, float tz)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body && b3Body_IsValid(body->bodyId))
    {
        b3Body_ApplyTorque(body->bodyId, marble_vec3(tx, ty, tz), true);
    }
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_body_apply_force_to_center(uintptr_t bodyPtr, float fx, float fy, float fz)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body && b3Body_IsValid(body->bodyId))
    {
        b3Body_ApplyForceToCenter(body->bodyId, marble_vec3(fx, fy, fz), true);
    }
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_body_apply_linear_impulse_to_center(uintptr_t bodyPtr, float ix, float iy, float iz)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body && b3Body_IsValid(body->bodyId))
    {
        b3Body_ApplyLinearImpulseToCenter(body->bodyId, marble_vec3(ix, iy, iz), true);
    }
}

EMSCRIPTEN_KEEPALIVE
int marble_box3d_body_get_linear_velocity(uintptr_t bodyPtr, float* outVel)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body == NULL || outVel == NULL || b3Body_IsValid(body->bodyId) == false)
    {
        return 0;
    }
    b3Vec3 vel = b3Body_GetLinearVelocity(body->bodyId);
    outVel[0] = vel.x;
    outVel[1] = vel.y;
    outVel[2] = vel.z;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_body_set_linear_velocity(uintptr_t bodyPtr, float vx, float vy, float vz)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body && b3Body_IsValid(body->bodyId))
    {
        b3Body_SetLinearVelocity(body->bodyId, marble_vec3(vx, vy, vz));
    }
}

EMSCRIPTEN_KEEPALIVE
int marble_box3d_body_get_angular_velocity(uintptr_t bodyPtr, float* outVel)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body == NULL || outVel == NULL || b3Body_IsValid(body->bodyId) == false)
    {
        return 0;
    }
    b3Vec3 vel = b3Body_GetAngularVelocity(body->bodyId);
    outVel[0] = vel.x;
    outVel[1] = vel.y;
    outVel[2] = vel.z;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_body_set_angular_velocity(uintptr_t bodyPtr, float wx, float wy, float wz)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body && b3Body_IsValid(body->bodyId))
    {
        b3Body_SetAngularVelocity(body->bodyId, marble_vec3(wx, wy, wz));
    }
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_body_set_damping(uintptr_t bodyPtr, float linearDamping, float angularDamping)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body && b3Body_IsValid(body->bodyId))
    {
        b3Body_SetLinearDamping(body->bodyId, linearDamping);
        b3Body_SetAngularDamping(body->bodyId, angularDamping);
    }
}

EMSCRIPTEN_KEEPALIVE
int marble_box3d_read_body_transform(uintptr_t bodyPtr, float* outTransform)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body == NULL || outTransform == NULL || b3Body_IsValid(body->bodyId) == false)
    {
        return 0;
    }
    b3WorldTransform transform = b3Body_GetTransform(body->bodyId);
    outTransform[0] = (float)transform.p.x;
    outTransform[1] = (float)transform.p.y;
    outTransform[2] = (float)transform.p.z;
    outTransform[3] = transform.q.v.x;
    outTransform[4] = transform.q.v.y;
    outTransform[5] = transform.q.v.z;
    outTransform[6] = transform.q.s;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int marble_box3d_world_raycast(uintptr_t worldPtr, float ox, float oy, float oz, float dx, float dy, float dz, float* outResult)
{
    MarbleBox3DBridgeWorld* bridgeWorld = (MarbleBox3DBridgeWorld*)worldPtr;
    if (bridgeWorld == NULL || b3World_IsValid(bridgeWorld->worldId) == false || outResult == NULL)
    {
        return 0;
    }

    b3Vec3 origin = marble_vec3(ox, oy, oz);
    b3Vec3 translation = marble_vec3(dx, dy, dz);
    b3QueryFilter filter = { 0 };
    filter.categoryBits = 0xFFFFFFFFFFFFFFFFULL;
    filter.maskBits = 0xFFFFFFFFFFFFFFFFULL;

    b3RayResult result = b3World_CastRayClosest(bridgeWorld->worldId, origin, translation, filter);
    if (result.shapeId.index1 == 0)
    {
        outResult[0] = 0.0f; // hit = false
        return 1;
    }

    outResult[0] = 1.0f; // hit = true
    outResult[1] = (float)result.point.x;
    outResult[2] = (float)result.point.y;
    outResult[3] = (float)result.point.z;
    outResult[4] = (float)result.normal.x;
    outResult[5] = (float)result.normal.y;
    outResult[6] = (float)result.normal.z;
    outResult[7] = result.fraction;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void marble_box3d_body_set_transform(uintptr_t bodyPtr, float x, float y, float z, float qx, float qy, float qz, float qw)
{
    MarbleBox3DBody* body = (MarbleBox3DBody*)bodyPtr;
    if (body && b3Body_IsValid(body->bodyId))
    {
        b3Pos pos = marble_vec3(x, y, z);
        b3Quat rot = { qx, qy, qz, qw };
        b3Body_SetTransform(body->bodyId, pos, rot);
    }
}
