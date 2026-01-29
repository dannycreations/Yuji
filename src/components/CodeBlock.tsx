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
      <div className="my-6 border border-white/10 rounded-lg overflow-hidden bg-black/40 industrial-noise industrial-grid shadow-2xl relative">
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500/20 border border-red-500/40" />
              <div className="w-2 h-2 rounded-full bg-amber-500/20 border border-amber-500/40" />
              <div className="w-2 h-2 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
            </div>
            <div className="h-4 w-[1px] bg-white/10 mx-1" />
            <div className="flex items-center gap-2">
              <Icon name="Network" size={12} className="text-primary opacity-80" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Diagram.sys</span>
            </div>
          </div>
          <button
            onClick={handleCopy}
            className="group/btn relative flex items-center gap-2 px-3 py-1 rounded border border-white/5 bg-white/5 hover:bg-primary/20 hover:border-primary/40 transition-all duration-200"
          >
            <Icon name={copied ? 'Check' : 'Copy'} size={12} className={copied ? 'text-emerald-400' : 'text-zinc-400 group-hover/btn:text-primary'} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 group-hover/btn:text-white">
              {copied ? 'Captured' : 'Copy'}
            </span>
          </button>
        </div>
        <div className="relative z-10">
          <MermaidBlock code={value} />
        </div>
      </div>
    );
  }

  return (
    <div className="my-6 border border-white/10 rounded-lg overflow-hidden bg-[#0d0d0d] group/code industrial-noise industrial-grid shadow-2xl relative">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-2 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-white/5 border border-white/10" />
            <div className="w-2 h-2 rounded-full bg-white/5 border border-white/10" />
          </div>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">{language || 'text'}</span>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="group/btn relative flex items-center gap-2 px-3 py-1 rounded border border-white/5 bg-white/5 hover:bg-primary/20 hover:border-primary/40 transition-all duration-200 active:scale-95"
        >
          <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover/btn:opacity-100 transition-opacity rounded" />
          <Icon
            name={copied ? 'Check' : 'Copy'}
            size={12}
            className={copied ? 'text-emerald-400' : 'text-zinc-400 group-hover/btn:text-primary transition-colors'}
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 group-hover/btn:text-white relative z-10">
            {copied ? 'Copied' : 'Copy'}
          </span>
        </button>
      </div>

      <div className="relative overflow-hidden">
        {/* Subtle Side Bar */}
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary/20 z-10" />

        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            background: 'transparent',
            padding: '1.5rem',
            paddingLeft: '2rem',
            fontSize: '0.85rem',
            lineHeight: '1.6',
            fontFamily: '"Fira Code", monospace',
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
      </div>
    </div>
  );
};
