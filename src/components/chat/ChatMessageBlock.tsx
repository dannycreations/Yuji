import clsx from 'clsx';
import mermaid from 'mermaid';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { useCopy } from '../../hooks/useCopy';
import { useStore } from '../../hooks/useStore';
import { randomString } from '../../utilities/CommonUtil';
import { Icon } from '../shared/Icon';
import { MermaidFullscreenModal } from './MermaidFullscreenModal';

import type { MermaidConfig } from 'mermaid';
import type { FC } from 'react';

const getMermaidConfig = (theme: 'dark' | 'light'): MermaidConfig => ({
  startOnLoad: false,
  theme: 'base',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  themeVariables:
    theme === 'dark'
      ? {
          fontSize: '14px',
          primaryColor: '#2f2f2f',
          primaryTextColor: '#ececec',
          primaryBorderColor: '#424242',
          lineColor: '#71717a',
          secondaryColor: '#171717',
          tertiaryColor: '#212121',
          mainBkg: '#2f2f2f',
          nodeBorder: '#424242',
          clusterBkg: '#171717',
          clusterBorder: '#424242',
          defaultLinkColor: '#71717a',
          titleColor: '#ececec',
          edgeLabelBackground: '#0d0d0d',
          nodeTextColor: '#ececec',

          // Sequence diagram specific
          noteBkgColor: '#424242',
          noteTextColor: '#ececec',
          noteBorderColor: '#71717a',
          actorBkg: '#2f2f2f',
          actorBorder: '#424242',
          actorTextColor: '#ececec',
          actorLineColor: '#71717a',
          signalColor: '#ececec',
          signalTextColor: '#ececec',
          labelBoxBkgColor: '#2f2f2f',
          labelBoxBorderColor: '#424242',
          labelTextColor: '#ececec',
          loopTextColor: '#ececec',
        }
      : {
          fontSize: '14px',
          primaryColor: '#f3f4f6',
          primaryTextColor: '#111827',
          primaryBorderColor: '#d1d5db',
          lineColor: '#9ca3af',
          secondaryColor: '#f9fafb',
          tertiaryColor: '#ffffff',
          mainBkg: '#f3f4f6',
          nodeBorder: '#d1d5db',
          clusterBkg: '#f9fafb',
          clusterBorder: '#d1d5db',
          defaultLinkColor: '#9ca3af',
          titleColor: '#111827',
          edgeLabelBackground: '#ffffff',
          nodeTextColor: '#111827',

          // Sequence diagram specific
          noteBkgColor: '#e5e7eb',
          noteTextColor: '#111827',
          noteBorderColor: '#9ca3af',
          actorBkg: '#f3f4f6',
          actorBorder: '#d1d5db',
          actorTextColor: '#111827',
          actorLineColor: '#9ca3af',
          signalColor: '#111827',
          signalTextColor: '#111827',
          labelBoxBkgColor: '#f3f4f6',
          labelBoxBorderColor: '#d1d5db',
          labelTextColor: '#111827',
          loopTextColor: '#111827',
        },
});

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
  const handleDownload = () => {
    const blob = new Blob([value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-${randomString(6)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  const mermaidConfig = useMemo(() => getMermaidConfig(theme), [theme]);

  useEffect(() => {
    let isMounted = true;
    const render = async () => {
      try {
        mermaid.initialize(mermaidConfig);
        const id = `mermaid-${randomString(8)}`;
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
