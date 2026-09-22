export interface RigPoint {
  x: number;
  y: number;
}

export interface RigSegment {
  from: RigPoint;
  to: RigPoint;
  width: number;
  t: number;
}

export interface AppendageRigSpec {
  rootX: number;
  rootY: number;
  direction: number;
  length: number;
  joints: number;
  baseWidth: number;
  tipWidth: number;
  amplitude: number;
  waveCycles: number;
  phaseOffset: number;
  velocityInfluence: number;
  maxExtent: number;
}

export interface AppendageRigFrame {
  radius: number;
  phase: number;
  transverseVelocity: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * 生成一条局部坐标附肢。根部固定，波形沿关节向末端传播，速度惯性只影响后半段。
 * 所有输出点都会被 maxExtent 限制，防止错误半径形成贯穿屏幕的射线。
 */
export const buildAppendageRig = (spec: AppendageRigSpec, frame: AppendageRigFrame): RigSegment[] => {
  const radius = Math.max(1, frame.radius);
  const joints = clamp(Math.round(spec.joints), 4, 10);
  const maxExtent = Math.max(1, spec.maxExtent) * radius;
  const root = { x: spec.rootX * radius, y: spec.rootY * radius };
  const directionX = Math.cos(spec.direction);
  const directionY = Math.sin(spec.direction);
  const normalX = -directionY;
  const normalY = directionX;
  const velocity = clamp(frame.transverseVelocity, -1, 1);
  const points: RigPoint[] = [];
  const widths: number[] = [];

  for (let index = 0; index <= joints; index += 1) {
    const t = index / joints;
    const propagation = Math.sin(frame.phase + spec.phaseOffset + t * spec.waveCycles * Math.PI * 2);
    const wave = propagation * spec.amplitude * radius * Math.pow(t, 1.15);
    const inertia = velocity * spec.velocityInfluence * radius * t * t;
    let x = root.x + directionX * spec.length * radius * t + normalX * (wave + inertia);
    let y = root.y + directionY * spec.length * radius * t + normalY * (wave + inertia);
    const distance = Math.hypot(x, y);
    if (distance > maxExtent) {
      const scale = maxExtent / distance;
      x *= scale;
      y *= scale;
    }
    points.push({ x, y });
    widths.push(radius * (spec.baseWidth + (spec.tipWidth - spec.baseWidth) * t));
  }

  return points.slice(1).map((to, index) => ({
    from: points[index],
    to,
    width: Math.max(1, (widths[index] + widths[index + 1]) / 2),
    t: (index + 0.5) / joints,
  }));
};

export const rigMaxDistance = (segments: readonly RigSegment[]): number =>
  segments.reduce((maximum, segment) => Math.max(maximum, Math.hypot(segment.from.x, segment.from.y), Math.hypot(segment.to.x, segment.to.y)), 0);
