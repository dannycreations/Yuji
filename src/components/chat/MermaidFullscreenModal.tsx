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
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.1), 10);

    if (newScale === scale) return;

    const ratio = newScale / scale;
    const newX = mouseX - (mouseX - position.x) * ratio;
    const newY = mouseY - (mouseY - position.y) * ratio;

    setScale(newScale);
    setPosition({ x: newX, y: newY });
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

  const handleZoom = (factor: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const newScale = Math.min(Math.max(scale * factor, 0.1), 10);
    if (newScale === scale) return;

    const ratio = newScale / scale;
    const newX = centerX - (centerX - position.x) * ratio;
    const newY = centerY - (centerY - position.y) * ratio;

    setScale(newScale);
    setPosition({ x: newX, y: newY });
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
          <button onClick={() => handleZoom(1.2)} className="btn-icon" title="Zoom In">
            <Icon name="ZoomIn" size={16} />
          </button>
          <button onClick={() => handleZoom(0.8)} className="btn-icon" title="Zoom Out">
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
            transformOrigin: '0 0',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="mermaid-fullscreen-indicator">Scroll to zoom • Drag to move</div>
      </div>
    </Modal>
  );
};
