import mermaid from 'mermaid';
import React, { useEffect, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Icon } from './Icon';

interface CodeBlockProps {
  language: string;
  value: string;
}

const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
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

  return (
    <div ref={containerRef} className="flex justify-center p-6 bg-white/5 rounded-lg overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
  );
};

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);
  const isMermaid = language === 'mermaid';

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isMermaid) {
    return (
      <div className="my-4 border border-surface_light rounded-xl overflow-hidden bg-black/20">
        <div className="flex items-center justify-between px-4 py-2 bg-surface_light/50 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Icon name="Network" size={14} className="text-primary" />
            <span className="text-xs font-medium text-zinc-400">Diagram</span>
          </div>
          <button onClick={handleCopy} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <Icon name={copied ? 'Check' : 'Copy'} size={14} />
          </button>
        </div>
        <MermaidBlock code={value} />
      </div>
    );
  }

  return (
    <div className="my-4 border border-surface_light rounded-xl overflow-hidden bg-[#282c34] group">
      <div className="flex items-center justify-between px-4 py-2 bg-surface_light/30 border-b border-white/5">
        <span className="text-xs font-medium text-zinc-400 lowercase">{language || 'text'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 transition-colors">
          <Icon name={copied ? 'Check' : 'Copy'} size={14} />
          <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="relative">
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            background: 'transparent',
            padding: '1.5rem',
            fontSize: '0.875rem',
            lineHeight: '1.5',
          }}
          wrapLongLines={true}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};
