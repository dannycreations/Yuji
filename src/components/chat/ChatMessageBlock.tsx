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

interface BaseMessageBlockProps {
  readonly label: string;
  readonly value: string;
  readonly children: React.ReactNode;
  readonly onDownload?: () => void;
}

const BaseMessageBlock: FC<BaseMessageBlockProps> = ({ label, value, children, onDownload }) => {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-container">
      <div className={clsx('code-block-header', isCollapsed ? 'collapsed' : 'expanded')} onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="flex items-center gap-2">
          <div className="code-block-header-icon" title={isCollapsed ? 'Expand' : 'Collapse'}>
            <Icon name={isCollapsed ? 'ChevronDown' : 'ChevronUp'} size={14} />
          </div>
          <span className="code-block-header-label">{label}</span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {onDownload && (
            <button onClick={onDownload} className="code-block-header-btn" title="Download">
              <Icon name="Download" size={14} />
            </button>
          )}
          <button onClick={handleCopy} className="code-block-header-btn" title={copied ? 'Copied' : 'Copy'}>
            <Icon name={copied ? 'Check' : 'Copy'} size={14} className={copied ? 'text-emerald-500' : ''} />
          </button>
        </div>
      </div>
      {!isCollapsed && <div className="code-block-content">{children}</div>}
    </div>
  );
};

const CodeBlock: FC<CodeBlockProps> = ({ language, value }) => {
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

  return (
    <BaseMessageBlock label={language || 'code'} value={value} onDownload={handleDownload}>
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
    </BaseMessageBlock>
  );
};

const MermaidBlock: FC<{ code: string }> = ({ code }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const render = async () => {
      try {
        mermaid.initialize({ startOnLoad: false, theme: 'base' });
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        const { svg } = await mermaid.render(id, code);
        if (isMounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Mermaid render error:', err);
          setError('render_failed');
        }
      }
    };
    render();
    return () => {
      isMounted = false;
    };
  }, [code]);

  return (
    <BaseMessageBlock label="diagram" value={code}>
      {error ? (
        <pre className="p-3 text-red-400 bg-red-900/10 rounded-lg overflow-x-auto text-xs">{code}</pre>
      ) : (
        <div ref={containerRef} className="flex justify-center p-3 bg-transparent overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </BaseMessageBlock>
  );
};

export const ChatMessageBlock: FC<CodeBlockProps> = ({ language, value }) => {
  if (language === 'mermaid') {
    return <MermaidBlock code={value} />;
  }

  return <CodeBlock language={language} value={value} />;
};
