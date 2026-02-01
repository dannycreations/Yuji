import clsx from 'clsx';
import mermaid from 'mermaid';
import { useEffect, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Icon } from '../shared/Icon';

import type { FC } from 'react';

interface CodeBlockProps {
  readonly language: string;
  readonly value: string;
}

const MermaidBlock: FC<{ code: string }> = ({ code }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const render = async () => {
      try {
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, code);
        if (isMounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Mermaid render error:', err);
          // setError('Failed to render diagram'); // Fallback to code
          setError('render_failed');
        }
      }
    };
    render();
    return () => {
      isMounted = false;
    };
  }, [code]);

  if (error) {
    return <pre className="p-4 text-red-400 bg-red-900/10 rounded-lg overflow-x-auto text-xs">{code}</pre>;
  }

  return <div ref={containerRef} className="flex justify-center p-6 bg-transparent overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
};

export const ChatMessageBlock: FC<CodeBlockProps> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMermaid = language === 'mermaid';

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-${Math.random().toString(36).slice(2, 7)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderHeader = () => (
    <div
      className={clsx(
        'flex items-center justify-between px-4 py-1.5 bg-code-header border-b select-none group/cbheader transition-colors cursor-pointer sticky top-0 z-10 backdrop-blur-md',
        isCollapsed ? 'border-b-transparent' : 'border-b-separator',
      )}
      onClick={() => setIsCollapsed(!isCollapsed)}
    >
      <div className="flex items-center gap-2">
        <div
          className="p-1.5 rounded-md text-code-text-muted group-hover/cbheader:text-code-text-active transition-colors"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <Icon name={isCollapsed ? 'ChevronDown' : 'ChevronUp'} size={14} />
        </div>
        <span className="text-xs font-medium text-code-text-muted lowercase tracking-wider group-hover/cbheader:text-code-text-active transition-colors">
          {isMermaid ? 'diagram' : language || 'code'}
        </span>
      </div>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {!isMermaid && (
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-md text-code-text-muted hover:text-code-text-active hover:bg-separator transition-colors"
            title="Download"
          >
            <Icon name="Download" size={14} />
          </button>
        )}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md text-code-text-muted hover:text-code-text-active hover:bg-separator transition-colors"
          title={copied ? 'Copied' : 'Copy'}
        >
          <Icon name={copied ? 'Check' : 'Copy'} size={14} className={copied ? 'text-emerald-500' : ''} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="my-1 border border-line rounded-xl bg-code shadow-lg w-full flex-shrink-0 overflow-clip">
      {renderHeader()}
      {!isCollapsed && (
        <div className="relative overflow-hidden">
          {isMermaid ? (
            <MermaidBlock code={value} />
          ) : (
            <SyntaxHighlighter
              style={oneDark}
              language={language}
              PreTag="div"
              customStyle={{
                margin: 0,
                borderRadius: 0,
                background: 'transparent',
                padding: '1.25rem',
                fontSize: '12px',
                lineHeight: '1.6',
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              }}
              codeTagProps={{
                style: {
                  background: 'transparent',
                  fontFamily: 'inherit',
                },
              }}
              wrapLongLines={true}
            >
              {value}
            </SyntaxHighlighter>
          )}
        </div>
      )}
    </div>
  );
};
