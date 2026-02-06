import { useRef, useState } from 'react';

import { Icon } from '../shared/Icon';
import { Modal } from '../shared/modal/Modal';

import type { FC } from 'react';

interface MermaidFullscreenModalProps {
  readonly svg: string;
  readonly onClose: () => void;
}

export const MermaidFullscreenModal: FC<MermaidFullscreenModalProps> = ({ svg, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(Math.max(prev * delta, 0.1), 10));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className="!p-0 !bg-background"
      containerClassName="!w-full !h-full !max-w-none !rounded-none flex flex-col overflow-hidden"
    >
      <div className="flex-between p-4 border-b border-separator/50" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium text-text-primary">Diagram Preview</h3>
        <div className="flex items-center gap-2">
          <button onClick={resetZoom} className="btn-icon" title="Reset Zoom">
            <Icon name="RefreshCw" size={16} />
          </button>
          <button onClick={() => setScale((s) => s * 1.2)} className="btn-icon" title="Zoom In">
            <Icon name="ZoomIn" size={16} />
          </button>
          <button onClick={() => setScale((s) => s * 0.8)} className="btn-icon" title="Zoom Out">
            <Icon name="ZoomOut" size={16} />
          </button>
          <div className="w-px h-4 bg-separator/50 mx-1" />
          <button onClick={onClose} className="btn-icon" title="Close">
            <Icon name="X" size={18} />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="mermaid-fullscreen-container flex-center absolute inset-0 transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="mermaid-fullscreen-indicator">Scroll to zoom • Drag to move</div>
      </div>
    </Modal>
  );
};
