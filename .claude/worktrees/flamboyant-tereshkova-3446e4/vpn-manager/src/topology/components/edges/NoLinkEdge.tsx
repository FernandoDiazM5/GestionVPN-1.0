import { memo } from 'react';
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';

function NoLinkEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
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
        stroke="#ef4444"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        style={style}
        className="react-flow__edge-path"
      />
      <EdgeLabelRenderer>
        <div
          className="absolute text-[10px] font-semibold text-red-500 bg-white/90 px-1.5 py-0.5 rounded-full shadow-sm pointer-events-none"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          No Link
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const NoLinkEdge = memo(NoLinkEdgeInner);
