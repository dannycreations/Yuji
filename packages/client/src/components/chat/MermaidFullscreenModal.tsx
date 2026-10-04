import { RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useRef, useState } from 'react';

import { ButtonInput } from '@yuji/client/components/shared/InputArea';
import { FullscreenModal } from '@yuji/client/components/shared/modal/FullscreenModal';

import type { FC } from 'react';

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface ZoomState {
  readonly scale: number;
  readonly position: Point;
}

const IDENTITY_ZOOM: ZoomState = { scale: 1, position: { x: 0, y: 0 } };

export const zoomAtAnchor = (current: ZoomState, factor: number, anchor: Point): ZoomState => {
  const scale = Math.min(Math.max(current.scale * factor, MIN_SCALE), MAX_SCALE);
  if (scale === current.scale) {
    return current;
  }

  const ratio = scale / current.scale;

  return {
    scale,
    position: {
      x: anchor.x - (anchor.x - current.position.x) * ratio,
      y: anchor.y - (anchor.y - current.position.y) * ratio,
    },
  };
};

interface MermaidFullscreenModalProps {
  readonly svg: string;
  readonly onClose: () => void;
}

export const MermaidFullscreenModal: FC<MermaidFullscreenModalProps> = ({ svg, onClose }) => {
  const [zoom, setZoom] = useState<ZoomState>(IDENTITY_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const applyZoom = (factor: number, anchor: Point) => setZoom((current) => zoomAtAnchor(current, factor, anchor));

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    applyZoom(e.deltaY > 0 ? 0.9 : 1.1, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - zoom.position.x, y: e.clientY - zoom.position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setZoom((current) => ({ ...current, position: { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y } }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoom = (factor: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    applyZoom(factor, { x: rect.width / 2, y: rect.height / 2 });
  };

  return (
    <FullscreenModal
      onClose={onClose}
      title="Diagram Preview"
      headerActions={
        <>
          <ButtonInput onClick={() => setZoom(IDENTITY_ZOOM)} title="Reset Zoom">
            <RefreshCw size={18} />
          </ButtonInput>
          <ButtonInput onClick={() => handleZoom(1.2)} title="Zoom In">
            <ZoomIn size={18} />
          </ButtonInput>
          <ButtonInput onClick={() => handleZoom(0.8)} title="Zoom Out">
            <ZoomOut size={18} />
          </ButtonInput>
        </>
      }
      bodyClassName="cursor-grab active:cursor-grabbing select-none"
    >
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="mermaid-fullscreen-container flex-center absolute inset-0 transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${zoom.position.x}px, ${zoom.position.y}px) scale(${zoom.scale})`,
            transformOrigin: '0 0',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="mermaid-fullscreen-indicator">Scroll to zoom • Drag to move</div>
      </div>
    </FullscreenModal>
  );
};
