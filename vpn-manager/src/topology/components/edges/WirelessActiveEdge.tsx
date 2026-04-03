import { memo } from 'react';
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';

function WirelessActiveEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke="#60a5fa"
        strokeWidth={1.5}
        strokeDasharray="8 5"
        style={style}
        className="react-flow__edge-path"
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-[10px] font-semibold text-blue-500 bg-white/90 px-1.5 py-0.5 rounded-full shadow-sm pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const WirelessActiveEdge = memo(WirelessActiveEdgeInner);
