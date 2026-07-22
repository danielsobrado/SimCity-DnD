import {
  PLAYER_GROUND_EPSILON,
  PLAYER_MAX_DELTA_SECONDS,
} from './playerConstants.js';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampToBounds(value, minimum, maximum) {
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    ? clamp(value, minimum, maximum)
    : value;
}

export function createPlayerState({ x, z, groundHeight, eyeHeight }) {
  return {
    x,
    y: groundHeight + eyeHeight,
    z,
    verticalVelocity: 0,
    grounded: true,
  };
}

export function stepPlayerPhysics({
  state,
  input,
  deltaSeconds,
  config,
  forward,
  right,
  getGroundHeight,
  bounds = null,
}) {
  const delta = clamp(deltaSeconds, 0, PLAYER_MAX_DELTA_SECONDS);
  const movementX = forward.x * input.forward + right.x * input.right;
  const movementZ = forward.z * input.forward + right.z * input.right;
  const length = Math.hypot(movementX, movementZ);
  const speed = config.walkSpeed * (input.running ? config.runMultiplier : 1);
  const scale = length > 0 ? speed * delta / length : 0;
  let nextX = clampToBounds(
    state.x + movementX * scale,
    bounds?.minX,
    bounds?.maxX,
  );
  let nextZ = clampToBounds(
    state.z + movementZ * scale,
    bounds?.minZ,
    bounds?.maxZ,
  );
  let groundEyeY = getGroundHeight(nextX, nextZ) + config.eyeHeight;

  if (groundEyeY - state.y > config.stepHeight) {
    nextX = state.x;
    nextZ = state.z;
    groundEyeY = getGroundHeight(nextX, nextZ) + config.eyeHeight;
  }

  let verticalVelocity = state.verticalVelocity;
  let nextY = state.y;
  let grounded = state.grounded;

  if (grounded && input.jump) {
    verticalVelocity = config.jumpSpeed;
    grounded = false;
  }

  if (grounded) {
    const dropDistance = state.y - groundEyeY;
    if (dropDistance <= config.groundSnapDistance) {
      nextY = groundEyeY;
    } else {
      grounded = false;
    }
  }

  if (!grounded) {
    verticalVelocity -= config.gravity * delta;
    nextY += verticalVelocity * delta;
  }

  if (nextY <= groundEyeY + PLAYER_GROUND_EPSILON && verticalVelocity <= 0) {
    nextY = groundEyeY;
    verticalVelocity = 0;
    grounded = true;
  }

  return {
    x: nextX,
    y: nextY,
    z: nextZ,
    verticalVelocity,
    grounded,
  };
}
