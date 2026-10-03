import { useEffect, useRef, useState } from 'react';
import type { FillPromptResponse, Prompt } from './types';
import { Icon } from './components/Icon';
import { Modal } from './components/Modal';
import './App.css';

type Notice = { kind: 'success' | 'error' | 'info'; text: string };
type Editor = { id: string | null; title: string; content: string };

const hasExtensionStorage = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;
const isPrompt = (value: unknown): value is Prompt =>
  typeof value === 'object' && value !== null &&
  'id' in value && typeof value.id === 'string' &&
  'title' in value && typeof value.title === 'string' &&
  'content' in value && typeof value.content === 'string';

function parsePrompts(markdown: string): Prompt[] {
  // Only a new TITLE/CONTENT pair starts a prompt. Markdown rules inside content stay intact.
  const pattern = /^\*\*TITLE:\*\*[ \t]*(.+)\r?\n\s*\*\*CONTENT:\*\*[ \t]*\r?\n([\s\S]*?)(?=^\*\*TITLE:\*\*[ \t]*.+\r?\n\s*\*\*CONTENT:\*\*[ \t]*\r?\n|(?![\s\S]))/gm;
  return [...markdown.matchAll(pattern)].flatMap((match, index, matches) => {
    const title = match[1].trim();
    const content = (index < matches.length - 1
      ? match[2].replace(/\r?\n\s*---\s*$/, '')
      : match[2]).trim();
    return title && content ? [{ id: crypto.randomUUID(), title, content }] : [];
  });
}

function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<Prompt | null>(null);
  const [pendingImport, setPendingImport] = useState<Prompt[] | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fillingId, setFillingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draggingIdRef = useRef<string | null>(null);
  const lastDragOverIdRef = useRef<string | null>(null);
  const fillPendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const stored = hasExtensionStorage()
          ? (await chrome.storage.local.get('prompts')).prompts
          : JSON.parse(localStorage.getItem('quick-prompts-preview') ?? '[]');
        const items: unknown = stored ?? [];
        if (!Array.isArray(items) || !items.every(isPrompt)) throw new Error('Invalid saved prompts');
        if (!cancelled) {
          setPrompts(items);
          setLoadState('ready');
        }
      } catch (error) {
        console.error('Could not load prompts:', error);
        if (!cancelled) {
          setLoadState('error');
          setNotice({ kind: 'error', text: '读取提示词失败，请重新打开扩展后再试。' });
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Wait for storage to load before saving; persist drag order after dropping.
    if (loadState !== 'ready' || draggingId) return;
    async function save() {
      try {
        if (hasExtensionStorage()) await chrome.storage.local.set({ prompts });
        else localStorage.setItem('quick-prompts-preview', JSON.stringify(prompts));
      } catch (error) {
        console.error('Could not save prompts:', error);
        setNotice({ kind: 'error', text: '保存失败，请导出提示词备份后重试。' });
      }
    }
    void save();
  }, [prompts, loadState, draggingId]);

  useEffect(() => {
    if (!notice || notice.kind === 'error') return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredPrompts = prompts.filter((prompt) =>
    (prompt.title + '\n' + prompt.content).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  const handleFillPrompt = async (prompt: Prompt) => {
    if (fillPendingRef.current) return;
    setNotice(null);
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      setNotice({ kind: 'info', text: '网页预览支持管理提示词；填充时请打开浏览器扩展。' });
      return;
    }

    fillPendingRef.current = true;
    setFillingId(prompt.id);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) {
        setNotice({ kind: 'error', text: '未找到当前标签页，请打开聊天网页后重试。' });
        return;
      }
      const hostname = tab.url ? new URL(tab.url).hostname : '';
      if (!['chatgpt.com', 'gemini.google.com', 'claude.ai'].includes(hostname)) {
        setNotice({ kind: 'error', text: '请在 ChatGPT、Gemini 或 Claude 网页上使用。' });
        return;
      }
      // A popup can update while an already-open tab still has the old script.
      const contentStatus: { protocolVersion?: number } | undefined = await chrome.tabs.sendMessage(
        tab.id, { type: 'QUICK_PROMPT_PING' }
      );
      if (contentStatus?.protocolVersion !== 1) {
        setNotice({ kind: 'error', text: '网页仍在使用旧版扩展脚本，请刷新聊天网页后重试。' });
        return;
      }
      const response: FillPromptResponse | undefined = await chrome.tabs.sendMessage(
        tab.id, { type: 'FILL_PROMPT', prompt }
      );
      if (response?.status === 'success') {
        setNotice({ kind: 'success', text: '已填入聊天框，确认内容后即可发送。' });
      } else {
        setNotice({ kind: 'error', text: response?.message ?? '未收到填充结果，请刷新网页后重试。' });
      }
    } catch (error) {
      console.error('Could not reach content script:', error);
      setNotice({ kind: 'error', text: '无法连接网页。更新扩展后，请刷新聊天网页再试。' });
    } finally {
      fillPendingRef.current = false;
      setFillingId(null);
    }
  };

  const saveEditor = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor?.title.trim() || !editor.content.trim()) return;
    const updated: Prompt = {
      id: editor.id ?? crypto.randomUUID(),
      title: editor.title.trim(),
      content: editor.content,
    };
    setPrompts((previous) => editor.id
      ? previous.map((item) => item.id === editor.id ? updated : item)
      : [...previous, updated]);
    setEditor(null);
    setNotice({ kind: 'success', text: editor.id ? '修改已保存。' : '提示词已添加。' });
    if (!editor.id) setQuery('');
  };

  const handleExport = () => {
    if (!prompts.length) return;
    const markdown = '# 快捷提示词导出\n\n' + prompts.map((prompt) =>
      '**TITLE:** ' + prompt.title + '\n\n**CONTENT:**\n' + prompt.content + '\n\n'
    ).join('---\n\n');
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '快捷提示词-' + new Date().toLocaleDateString('sv-SE') + '.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ kind: 'success', text: '已导出 ' + prompts.length + ' 条提示词。' });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = parsePrompts(await file.text());
      if (!imported.length) {
        setNotice({ kind: 'error', text: '没有找到提示词，请选择本扩展导出的 Markdown 文件。' });
        return;
      }
      setPendingImport(imported);
    } catch (error) {
      console.error('Could not import prompts:', error);
      setNotice({ kind: 'error', text: '无法读取文件，请检查文件内容后重试。' });
    }
  };

  const movePrompt = (activeId: string, overId: string) => {
    setPrompts((previous) => {
      const from = previous.findIndex((prompt) => prompt.id === activeId);
      const to = previous.findIndex((prompt) => prompt.id === overId);
      if (from < 0 || to < 0 || from === to) return previous;
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDragEnd = () => {
    draggingIdRef.current = null;
    lastDragOverIdRef.current = null;
    setDraggingId(null);
  };

  const handleCopy = async (prompt: Prompt) => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopiedId(prompt.id);
      setNotice({ kind: 'success', text: '提示词已复制。' });
    } catch {
      setNotice({ kind: 'error', text: '复制失败，可在详情中选中文本手动复制。' });
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon"><Icon name="spark" size={23} /></span>
          <div><h1>快捷提示词</h1><p>常用提示词，一键填入</p></div>
        </div>
        <div className="header-actions">
          <button className="utility-button" onClick={handleExport} disabled={!prompts.length} title="导出全部提示词"><Icon name="download" size={15} /><span>导出</span></button>
          <button className="utility-button" onClick={() => fileInputRef.current?.click()} disabled={loadState !== 'ready'} title="从文件导入提示词"><Icon name="upload" size={15} /><span>导入</span></button>
        </div>
      </header>

      <div className="search-field">
        <Icon name="search" size={18} />
        <input aria-label="搜索提示词" placeholder="搜索标题或内容…" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="清空搜索" title="清空搜索"><Icon name="close" size={15} /></button>}
        {!query && <span className="search-hint">快速查找</span>}
      </div>

      <div className="list-heading">
        <h2>{query.trim() ? '搜索结果' : '我的提示词'}<span className="count">{filteredPrompts.length}</span></h2>
        <span>{query.trim() ? '共 ' + prompts.length + ' 条' : '点击填充 · 拖动排序'}</span>
      </div>

      <section className="prompt-list" aria-label="提示词列表" aria-busy={loadState === 'loading'}>
        {loadState === 'loading' && <div className="empty-state"><span className="spinner" /><h3>正在读取提示词…</h3></div>}
        {loadState === 'error' && <div className="empty-state"><span className="empty-icon"><Icon name="alert" size={26} /></span><h3>暂时无法读取</h3><p>请关闭弹窗后重新打开。</p></div>}
        {loadState === 'ready' && !filteredPrompts.length && (
          <div className="empty-state">
            <span className="empty-icon"><Icon name={query.trim() ? 'search' : 'spark'} size={28} /></span>
            <h3>{query.trim() ? '没有找到相关提示词' : '把常用提示词放在这里'}</h3>
            <p>{query.trim() ? '试试其他关键词，或清空搜索。' : '保存一次，下次点击就能填入聊天框。'}</p>
            {query.trim()
              ? <button className="text-button" onClick={() => setQuery('')}>清空搜索<Icon name="arrow" size={15} /></button>
              : <span className="empty-tip">从下方添加，也可以导入已有文件</span>}
          </div>
        )}
        {filteredPrompts.map((prompt, index) => (
          <article key={prompt.id} className={'prompt-card' + (draggingId === prompt.id ? ' is-dragging' : '')}
            onDragOver={(event) => {
              if (query.trim() || !draggingIdRef.current || draggingIdRef.current === prompt.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (lastDragOverIdRef.current === prompt.id) return;
              lastDragOverIdRef.current = prompt.id;
              movePrompt(draggingIdRef.current, prompt.id);
            }}
            onDrop={(event) => { event.preventDefault(); handleDragEnd(); }}>
            <button className="drag-handle" title={query.trim() ? '清空搜索后可排序' : '拖动排序；也可按上下方向键移动'}
              aria-label={'调整“' + prompt.title + '”的顺序'} disabled={!!query.trim()} draggable={!query.trim()}
              onDragStart={(event) => {
                draggingIdRef.current = prompt.id;
                lastDragOverIdRef.current = null;
                setDraggingId(prompt.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', prompt.id);
              }} onDragEnd={handleDragEnd}
              onKeyDown={(event) => {
                const target = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : -1;
                if (target < 0 || target >= prompts.length || query.trim()) return;
                event.preventDefault();
                movePrompt(prompt.id, prompts[target].id);
              }}><Icon name="grip" size={15} /></button>
            <button className="prompt-fill" onClick={() => void handleFillPrompt(prompt)} disabled={fillingId !== null}
              title={'填入“' + prompt.title + '”'} aria-label={'填入“' + prompt.title + '”'}>
              <span className="prompt-title">{prompt.title}</span>
              <span className="prompt-preview">{prompt.content.replace(/\s+/g, ' ').trim()}</span>
            </button>
            <div className="prompt-actions">
              {fillingId === prompt.id ? <span className="spinner small" /> : <>
                <button className="icon-button" onClick={() => { setCopiedId(null); setDetailPrompt(prompt); }} title="查看详情" aria-label={'查看“' + prompt.title + '”的详情'}><Icon name="info" size={16} /></button>
                <button className="icon-button" onClick={() => setEditor({ ...prompt })} title="编辑提示词" aria-label={'编辑“' + prompt.title + '”'}><Icon name="edit" size={16} /></button>
                <button className="icon-button danger" onClick={() => setDeletePrompt(prompt)} title="删除提示词" aria-label={'删除“' + prompt.title + '”'}><Icon name="trash" size={16} /></button>
              </>}
            </div>
          </article>
        ))}
      </section>

      <footer className="app-footer">
        <div className={'notice-slot' + (notice ? ' has-notice' : '')}>
          {notice && <div className={'notice ' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={notice.kind === 'success' ? 'check' : notice.kind === 'error' ? 'alert' : 'info'} size={16} />
            <span>{notice.text}</span>
            <button className="notice-close" onClick={() => setNotice(null)} title="关闭提示" aria-label="关闭提示"><Icon name="close" size={14} /></button>
          </div>}
        </div>
        <button className="primary-button add-button" onClick={() => setEditor({ id: null, title: '', content: '' })} disabled={loadState !== 'ready'}>
          <Icon name="plus" size={19} />添加提示词
        </button>
        <div className="footer-note"><span className="status-dot" />支持 ChatGPT · Claude · Gemini</div>
      </footer>

      <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" hidden onChange={(event) => void handleFileChange(event)} />

      {editor && <Modal title={editor.id ? '编辑提示词' : '添加提示词'} subtitle="给常用表达起个名字，下次一键调用。" onClose={() => setEditor(null)}>
        <form className="editor-form" onSubmit={saveEditor}>
          <label className="field-label" htmlFor="prompt-title">标题</label>
          <input id="prompt-title" className="form-input" placeholder="例如：论文精读、全文翻译" value={editor.title} autoFocus required
            onChange={(event) => setEditor({ ...editor, title: event.target.value })} />
          <div className="content-label"><label className="field-label" htmlFor="prompt-content">提示词内容</label><span>{editor.content.length} 字符</span></div>
          <textarea id="prompt-content" className="form-input content-input" placeholder="输入你的提示词，支持多行文本和 Markdown…" value={editor.content} required
            onChange={(event) => setEditor({ ...editor, content: event.target.value })}
            onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <p className="field-help">保留原始换行和格式 · Ctrl + 回车保存</p>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditor(null)}>取消</button>
            <button type="submit" className="primary-button" disabled={!editor.title.trim() || !editor.content.trim()}><Icon name="check" size={17} />{editor.id ? '保存修改' : '保存提示词'}</button></div>
        </form>
      </Modal>}

      {detailPrompt && <Modal title="提示词详情" onClose={() => setDetailPrompt(null)}>
        <h3 className="detail-title">{detailPrompt.title}</h3>
        <div className="detail-content" tabIndex={0}>{detailPrompt.content}</div>
        <div className="detail-meta">{detailPrompt.content.length} 字符<span>保留原始格式</span></div>
        <div className="modal-actions"><button className="secondary-button" onClick={() => void handleCopy(detailPrompt)}><Icon name={copiedId === detailPrompt.id ? 'check' : 'copy'} size={16} />{copiedId === detailPrompt.id ? '已复制' : '复制内容'}</button>
          <button className="primary-button" onClick={() => { setEditor({ ...detailPrompt }); setDetailPrompt(null); }}><Icon name="edit" size={16} />编辑提示词</button></div>
      </Modal>}

      {deletePrompt && <Modal title="删除这条提示词？" onClose={() => setDeletePrompt(null)}>
        <p className="confirm-description">即将删除「{deletePrompt.title}」。删除后无法恢复，你也可以先导出备份。</p>
        <div className="modal-actions"><button className="secondary-button" data-autofocus onClick={() => setDeletePrompt(null)}>保留</button>
          <button className="danger-button" onClick={() => {
            setPrompts((previous) => previous.filter((prompt) => prompt.id !== deletePrompt.id));
            setDeletePrompt(null);
            setNotice({ kind: 'success', text: '提示词已删除。' });
          }}>确认删除</button></div>
      </Modal>}

      {pendingImport && <Modal title="导入提示词" onClose={() => setPendingImport(null)}>
        <p className="confirm-description">文件中找到 <strong>{pendingImport.length}</strong> 条提示词，将添加到现有的 {prompts.length} 条提示词中。</p>
        <div className="import-preview">{pendingImport.slice(0, 4).map((prompt) => <div key={prompt.id}><Icon name="document" size={15} /><span>{prompt.title}</span></div>)}
          {pendingImport.length > 4 && <p>以及其他 {pendingImport.length - 4} 条…</p>}</div>
        <div className="modal-actions"><button className="secondary-button" onClick={() => setPendingImport(null)}>取消</button>
          <button className="primary-button" onClick={() => {
            setPrompts((previous) => [...previous, ...pendingImport]);
            setNotice({ kind: 'success', text: '已导入 ' + pendingImport.length + ' 条提示词。' });
            setPendingImport(null);
            setQuery('');
          }}><Icon name="upload" size={16} />确认导入</button></div>
      </Modal>}
    </main>
  );
}

export default App;
