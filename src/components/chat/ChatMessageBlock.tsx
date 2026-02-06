import clsx from 'clsx';
import mermaid from 'mermaid';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { MERMAID_CONFIG } from '../../app/Constant';
import { useCopy } from '../../hooks/useCopy';
import { useStore } from '../../hooks/useStore';
import { downloadFile, randomId } from '../../utilities/CommonUtil';
import { Icon } from '../shared/Icon';
import { MermaidFullscreenModal } from './MermaidFullscreenModal';

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
  readonly onFullscreen?: () => void;
}

const BaseMessageBlock: FC<BaseMessageBlockProps> = ({ label, value, children, onDownload, onFullscreen }) => {
  const expandCodeblock = useStore((s) => s.settings.expandCodeblock);
  const [copied, setCopy] = useCopy();
  const [isCollapsed, setIsCollapsed] = useState(!expandCodeblock);

  const handleCopy = () => {
    setCopy(value);
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
          <button onClick={handleCopy} className="code-block-header-btn" title={copied ? 'Copied' : 'Copy'}>
            <Icon name={copied ? 'Check' : 'Copy'} size={14} className={clsx(copied && 'code-block-header-btn-copy')} />
          </button>
          {onFullscreen && (
            <button onClick={onFullscreen} className="code-block-header-btn" title="Fullscreen">
              <Icon name="Maximize" size={14} />
            </button>
          )}
          {onDownload && (
            <button onClick={onDownload} className="code-block-header-btn" title="Download">
              <Icon name="Download" size={14} />
            </button>
          )}
        </div>
      </div>
      <div className={clsx('code-block-content', isCollapsed && 'hidden')}>{children}</div>
    </div>
  );
};

const CodeBlock: FC<CodeBlockProps> = ({ language, value }) => {
  const theme = useStore((s) => s.settings.theme);
  const handleDownload = () => downloadFile(value, `code-${randomId(6)}.txt`);

  return (
    <BaseMessageBlock label={language || 'code'} value={value} onDownload={handleDownload}>
      <SyntaxHighlighter
        style={theme === 'dark' ? oneDark : oneLight}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          background: 'transparent',
          padding: '0.75rem',
          fontSize: 'var(--font-size-xs)',
          lineHeight: 'inherit',
          fontFamily: 'var(--font-sans)',
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
  const theme = useStore((s) => s.settings.theme);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const mermaidConfig = useMemo(() => MERMAID_CONFIG(theme), [theme]);

  useEffect(() => {
    let isMounted = true;
    const render = async () => {
      try {
        mermaid.initialize(mermaidConfig);
        const id = `mermaid-${randomId(8)}`;
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
  }, [code, mermaidConfig]);

  return (
    <>
      <BaseMessageBlock label="diagram" value={code} onFullscreen={svg ? () => setIsFullscreen(true) : undefined}>
        {error ? (
          <pre className="code-error">{code}</pre>
        ) : (
          <div ref={containerRef} className="mermaid-container" dangerouslySetInnerHTML={{ __html: svg }} />
        )}
      </BaseMessageBlock>
      {isFullscreen && <MermaidFullscreenModal svg={svg} onClose={() => setIsFullscreen(false)} />}
    </>
  );
};

export const ChatMessageBlock: FC<CodeBlockProps> = ({ language, value }) => {
  if (language === 'mermaid') {
    return <MermaidBlock code={value} />;
  }

  return <CodeBlock language={language} value={value} />;
};
