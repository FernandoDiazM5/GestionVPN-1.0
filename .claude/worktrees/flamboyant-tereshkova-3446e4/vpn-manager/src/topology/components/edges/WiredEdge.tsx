import { memo } from 'react';
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';

function WiredEdgeInner({
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
        stroke="#3b82f6"
        strokeWidth={2}
        style={style}
        className="react-flow__edge-path"
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-[10px] font-semibold text-blue-600 bg-white border border-blue-200 px-1.5 py-0.5 rounded-full shadow-sm pointer-events-none"
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

export const WiredEdge = memo(WiredEdgeInner);
