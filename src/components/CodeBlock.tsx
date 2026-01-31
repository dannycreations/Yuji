import mermaid from 'mermaid';
import { useEffect, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Icon } from './shared/Icon';

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
    return <pre className="p-4 text-red-400 bg-red-900/10 rounded-lg overflow-x-auto">{code}</pre>;
  }

  return <div ref={containerRef} className="flex justify-center p-6 bg-transparent overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
};

export const CodeBlock: FC<CodeBlockProps> = ({ language, value }) => {
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
      className="flex items-center justify-between px-4 py-1.5 bg-zinc-900/50 border-b border-white/[0.05] cursor-pointer select-none group transition-colors"
      onClick={() => setIsCollapsed(!isCollapsed)}
      style={{ borderBottomColor: isCollapsed ? 'transparent' : undefined }}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md text-zinc-500 group-hover:text-zinc-300 transition-colors" title={isCollapsed ? 'Expand' : 'Collapse'}>
          <Icon name={isCollapsed ? 'ChevronDown' : 'ChevronUp'} size={14} />
        </div>
        <span className="text-xs font-medium text-zinc-500 lowercase tracking-wider group-hover:text-zinc-300 transition-colors">
          {isMermaid ? 'diagram' : language || 'code'}
        </span>
      </div>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {!isMermaid && (
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
            title="Download"
          >
            <Icon name="Download" size={14} />
          </button>
        )}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          title={copied ? 'Copied' : 'Copy'}
        >
          <Icon name={copied ? 'Check' : 'Copy'} size={14} className={copied ? 'text-emerald-500' : ''} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="my-1 border border-white/10 rounded-xl overflow-hidden bg-[#0d0d0d] shadow-lg w-full">
      {renderHeader()}
      {!isCollapsed && (
        <div className="relative">
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
                fontSize: '0.875rem',
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
