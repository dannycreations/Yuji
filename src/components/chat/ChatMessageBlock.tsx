import clsx from 'clsx';
import { Check, ChevronDown, ChevronUp, Copy, Download, Maximize } from 'lucide-react';
import mermaid from 'mermaid';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { MERMAID_CONFIG } from '../../app/Constant';
import { useCopy } from '../../hooks/useCopy';
import { useStore } from '../../hooks/useStore';
import { downloadFile, randomId } from '../../utilities/CommonUtil';
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
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
          <span className="code-block-header-label">{label}</span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={handleCopy} className="code-block-header-btn" title={copied ? 'Copied' : 'Copy'}>
            {copied ? <Check size={14} className="code-block-header-btn-copy" /> : <Copy size={14} />}
          </button>
          {onFullscreen && (
            <button onClick={onFullscreen} className="code-block-header-btn" title="Fullscreen">
              <Maximize size={14} />
            </button>
          )}
          {onDownload && (
            <button onClick={onDownload} className="code-block-header-btn" title="Download">
              <Download size={14} />
            </button>
          )}
        </div>
      </div>
      <div className={clsx('code-block-content', isCollapsed && 'hidden')}>{children}</div>
    </div>
  );
};

const CodeBlock: FC<CodeBlockProps> = memo(({ language, value }) => {
  const theme = useStore((s) => s.settings.theme);
  const handleDownload = useCallback(() => downloadFile(value, `code-${randomId(6)}.txt`), [value]);

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
});

const mermaidCache = new Map<string, string>();

const MermaidBlock: FC<{ code: string }> = memo(({ code }) => {
  const theme = useStore((s) => s.settings.theme);
  const [svg, setSvg] = useState<string>(() => mermaidCache.get(`${theme}-${code}`) || '');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const mermaidConfig = useMemo(() => MERMAID_CONFIG(theme), [theme]);

  useEffect(() => {
    const cached = mermaidCache.get(`${theme}-${code}`);
    if (cached) {
      setSvg(cached);
      return;
    }

    let isMounted = true;
    const render = async () => {
      try {
        mermaid.initialize(mermaidConfig);
        const id = `mermaid-${randomId(8)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);

        if (!isMounted) {
          return;
        }

        mermaidCache.set(`${theme}-${code}`, renderedSvg);
        setSvg(renderedSvg);
        setError(null);
      } catch (err) {
        if (!isMounted) {
          return;
        }

        console.error('Mermaid render error:', err);
        setError('render_failed');
      }
    };

    render();

    return () => {
      isMounted = false;
    };
  }, [code, theme, mermaidConfig]);

  const handleFullscreen = useCallback(() => setIsFullscreen(true), []);
  const handleCloseFullscreen = useCallback(() => setIsFullscreen(false), []);

  return (
    <>
      <BaseMessageBlock label="diagram" value={code} onFullscreen={svg ? handleFullscreen : undefined}>
        {error ? (
          <pre className="code-error">{code}</pre>
        ) : (
          <div ref={containerRef} className={clsx('mermaid-container', !svg && 'opacity-0')} dangerouslySetInnerHTML={{ __html: svg }} />
        )}
      </BaseMessageBlock>
      {isFullscreen && <MermaidFullscreenModal svg={svg} onClose={handleCloseFullscreen} />}
    </>
  );
});

export const ChatMessageBlock: FC<CodeBlockProps> = memo(({ language, value }) => {
  if (language === 'mermaid') {
    return <MermaidBlock code={value} />;
  }

  return <CodeBlock language={language} value={value} />;
});
