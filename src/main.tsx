import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Loader2,
  MessageSquareText,
  Play,
  RefreshCw,
  Save,
  Settings,
  SlidersHorizontal,
  UploadCloud,
} from 'lucide-react';
import './styles.css';

type CommentType = '书评' | '章评' | '段评';
type TaskStatus = 'created' | 'running' | 'completed' | 'completed_with_errors' | 'failed';
type RowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'invalid';

interface MappingRule {
  label: string;
  min: number;
  max: number;
  includeMax: boolean;
}

interface AppConfig {
  prompts: {
    bookReview: string;
    chapterComment: string;
    paragraphComment: string;
  };
  qualityRules: MappingRule[];
  emotionRules: MappingRule[];
  updatedAt: string;
}

interface TaskSummary {
  id: string;
  name: string;
  fileName: string;
  status: TaskStatus;
  totalRows: number;
  validRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
  updatedAt: string;
}

interface ScoreResult {
  comment_type: string;
  quality_score: number;
  quality_level: string;
  quality_reason: string;
  emotion_score: number;
  emotion_type: string;
}

interface TaskRow {
  id: string;
  rowNumber: number;
  comment_type: string;
  comment_content: string;
  status: RowStatus;
  error?: string;
  result?: ScoreResult;
}

interface ScoreTask extends TaskSummary {
  rows: TaskRow[];
}

interface Health {
  ok: boolean;
  dify: { configured: boolean; baseUrl: string };
  storage: string;
}

const promptTabs: Array<{ key: keyof AppConfig['prompts']; label: string }> = [
  { key: 'bookReview', label: '书评 Prompt' },
  { key: 'chapterComment', label: '章评 Prompt' },
  { key: 'paragraphComment', label: '段评 Prompt' },
];

function api<T>(url: string, options?: RequestInit): Promise<T> {
  return fetch(url, options).then(async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(typeof body === 'string' ? body : body.error || body.message || '请求失败');
    }
    return body as T;
  });
}

function statusLabel(status: TaskStatus | RowStatus) {
  const labels: Record<string, string> = {
    created: '待处理',
    running: '运行中',
    completed: '已完成',
    completed_with_errors: '部分失败',
    failed: '失败',
    pending: '待处理',
    invalid: '无效',
  };
  return labels[status] || status;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function classForLevel(level?: string) {
  if (level === '好' || level === '正向') return 'good';
  if (level === '中' || level === '中性') return 'mid';
  if (level === '差' || level === '负向') return 'bad';
  return 'neutral';
}

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedTask, setSelectedTask] = useState<ScoreTask | null>(null);
  const [activePrompt, setActivePrompt] = useState<keyof AppConfig['prompts']>('bookReview');
  const [activeNav, setActiveNav] = useState('tasks');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    const [healthData, configData, taskData] = await Promise.all([
      api<Health>('/api/health'),
      api<AppConfig>('/api/config'),
      api<TaskSummary[]>('/api/tasks'),
    ]);
    setHealth(healthData);
    setConfig(configData);
    setTasks(taskData);
    if (selectedTask) {
      const updated = await api<ScoreTask>(`/api/tasks/${selectedTask.id}`);
      setSelectedTask(updated);
    } else if (taskData[0]) {
      setSelectedTask(await api<ScoreTask>(`/api/tasks/${taskData[0].id}`));
    }
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, []);

  async function uploadFile(file: File) {
    setBusy('upload');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', file.name.replace(/\.[^.]+$/, ''));
      const task = await api<ScoreTask>('/api/tasks/upload', { method: 'POST', body: form });
      setSelectedTask(task);
      await refresh();
      setMessage(`已导入 ${task.totalRows} 行，${task.validRows} 行有效`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败');
    } finally {
      setBusy('');
    }
  }

  async function runTask(mode: 'all' | 'failed' = 'all') {
    if (!selectedTask) return;
    setBusy('run');
    setMessage('正在调用 Dify 工作流跑分...');
    try {
      const task = await api<ScoreTask>(`/api/tasks/${selectedTask.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      setSelectedTask(task);
      await refresh();
      setMessage('跑分完成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '跑分失败');
    } finally {
      setBusy('');
    }
  }

  async function saveConfig() {
    if (!config) return;
    setBusy('save');
    try {
      const saved = await api<AppConfig>('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setConfig(saved);
      setMessage('配置已保存到本地');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  async function injectConfig() {
    setBusy('inject');
    try {
      await api('/api/config/inject', { method: 'POST' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '线上注入失败');
    } finally {
      setBusy('');
    }
  }

  const rows = useMemo(() => {
    const items = selectedTask?.rows ?? [];
    const keyword = query.trim();
    if (!keyword) return items;
    return items.filter((row) => `${row.comment_type}${row.comment_content}${row.result?.quality_reason ?? ''}`.includes(keyword));
  }, [selectedTask, query]);

  const activeTaskId = selectedTask?.id;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><MessageSquareText size={20} /></div>
          <strong>评论质量打分控制台</strong>
        </div>
        {[
          ['tasks', ClipboardList, '任务管理'],
          ['prompts', MessageSquareText, 'Prompt 管理'],
          ['mapping', SlidersHorizontal, '映射规则'],
          ['logs', BarChart3, '运行日志'],
        ].map(([key, Icon, label]) => (
          <button key={key as string} className={`nav-item ${activeNav === key ? 'active' : ''}`} onClick={() => setActiveNav(key as string)}>
            {React.createElement(Icon as typeof ClipboardList, { size: 18 })}
            {label as string}
          </button>
        ))}
        <button className="collapse-button" type="button">收起侧边栏</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>评论质量打分控制台</h1>
            <p>导入 Excel 评论，调用 Dify 工作流输出质量与情绪结构化结果。</p>
          </div>
          <div className="status-row">
            <span className={`status-chip ${health?.dify.configured ? 'ok' : 'warn'}`}>
              <span />
              Dify 连接 {health?.dify.configured ? '已配置' : '未配置'}
            </span>
            <span className="status-chip ok"><span />本地存储 正常</span>
            <Settings size={18} />
          </div>
        </header>

        <div className="content-grid">
          <section className="left-column">
            <div
              className="upload-card"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) uploadFile(file);
              }}
            >
              <div className="upload-zone" onClick={() => fileInput.current?.click()}>
                <UploadCloud size={42} />
                <strong>拖拽 Excel 文件到此处</strong>
                <span>支持 .xlsx/.xls，字段为 comment_type/comment_content 或 评论类型/评论内容</span>
              </div>
              <input ref={fileInput} hidden type="file" accept=".xlsx,.xls" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadFile(file);
              }} />
              <button className="primary-button" disabled={busy === 'upload'} onClick={() => fileInput.current?.click()}>
                {busy === 'upload' ? <Loader2 className="spin" size={16} /> : <FileSpreadsheet size={16} />}
                导入文件
              </button>
            </div>

            <section className="panel">
              <div className="panel-title">
                <h2>任务列表</h2>
                <button className="icon-button" onClick={() => refresh()}><RefreshCw size={16} /></button>
              </div>
              <div className="task-table">
                <table>
                  <thead>
                    <tr><th>任务名</th><th>文件名</th><th>进度</th><th>状态</th><th>创建时间</th></tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id} className={activeTaskId === task.id ? 'selected' : ''} onClick={async () => setSelectedTask(await api<ScoreTask>(`/api/tasks/${task.id}`))}>
                        <td>{task.name}</td>
                        <td>{task.fileName}</td>
                        <td>{task.successRows}/{task.validRows}</td>
                        <td><span className={`pill ${task.status.includes('error') || task.status === 'failed' ? 'bad' : task.status === 'running' ? 'mid' : 'good'}`}>{statusLabel(task.status)}</span></td>
                        <td>{formatDate(task.createdAt)}</td>
                      </tr>
                    ))}
                    {!tasks.length && <tr><td colSpan={5} className="empty">还没有任务，先导入一个 Excel 文件。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel result-panel">
              <div className="panel-title">
                <div>
                  <h2>任务详情</h2>
                  {selectedTask && <p>总数 {selectedTask.totalRows}，成功 {selectedTask.successRows}，失败 {selectedTask.failedRows}</p>}
                </div>
                <div className="action-row">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索评论内容" />
                  <button className="secondary-button" disabled={!selectedTask || busy === 'run'} onClick={() => runTask('failed')}>重跑失败</button>
                  <button className="primary-button" disabled={!selectedTask || busy === 'run'} onClick={() => runTask('all')}>
                    {busy === 'run' ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                    开始跑分
                  </button>
                  <a className={`secondary-button ${!selectedTask ? 'disabled' : ''}`} href={selectedTask ? `/api/tasks/${selectedTask.id}/export` : undefined}>
                    <Download size={16} />导出
                  </a>
                </div>
              </div>
              <div className="result-table">
                <table>
                  <thead>
                    <tr>
                      <th>评论类型</th><th>评论内容</th><th>质量分</th><th>质量等级</th><th>情绪分</th><th>情绪类型</th><th>状态</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.comment_type || '-'}</td>
                        <td className="comment-cell" title={row.comment_content}>{row.comment_content || row.error}</td>
                        <td>{row.result?.quality_score ?? '-'}</td>
                        <td><span className={`pill ${classForLevel(row.result?.quality_level)}`}>{row.result?.quality_level ?? '-'}</span></td>
                        <td>{row.result?.emotion_score ?? '-'}</td>
                        <td><span className={`pill ${classForLevel(row.result?.emotion_type)}`}>{row.result?.emotion_type ?? '-'}</span></td>
                        <td><span className={`pill ${row.status === 'failed' || row.status === 'invalid' ? 'bad' : row.status === 'running' ? 'mid' : row.status === 'completed' ? 'good' : 'neutral'}`}>{statusLabel(row.status)}</span></td>
                        <td><button className="mini-button" title={row.result?.quality_reason || row.error}>详情</button></td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={8} className="empty">暂无明细。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <aside className="inspector">
            {config && (
              <>
                <div className="tabs">
                  {promptTabs.map((tab) => (
                    <button key={tab.key} className={activePrompt === tab.key ? 'active' : ''} onClick={() => setActivePrompt(tab.key)}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <label className="field-label">提示词编辑</label>
                <p className="field-hint">默认值来自 Dify 工作流 YAML 基线中对应的书评、章评、段评打分节点。</p>
                <textarea
                  value={config.prompts[activePrompt]}
                  onChange={(event) => setConfig({ ...config, prompts: { ...config.prompts, [activePrompt]: event.target.value } })}
                />
                <div className="inspector-actions">
                  <button className="primary-button" onClick={saveConfig} disabled={busy === 'save'}><Save size={16} />保存提示词</button>
                  <button className="secondary-button" onClick={injectConfig} disabled={busy === 'inject'}>注入线上</button>
                </div>

                <MappingEditor
                  title="quality_score -> quality_level"
                  rules={config.qualityRules}
                  onChange={(qualityRules) => setConfig({ ...config, qualityRules })}
                />
                <MappingEditor
                  title="emotion_score -> emotion_type"
                  rules={config.emotionRules}
                  onChange={(emotionRules) => setConfig({ ...config, emotionRules })}
                />
              </>
            )}
          </aside>
        </div>
        {message && <div className="toast"><CheckCircle2 size={16} />{message}</div>}
      </section>
    </main>
  );
}

function MappingEditor({ title, rules, onChange }: {
  title: string;
  rules: MappingRule[];
  onChange: (rules: MappingRule[]) => void;
}) {
  return (
    <section className="mapping-card">
      <div className="mapping-head">
        <h3>{title}</h3>
        <button className="icon-button" onClick={() => onChange([...rules, { label: '新等级', min: 0, max: 0, includeMax: false }])}>+</button>
      </div>
      <div className="mapping-grid header"><span>最小值</span><span>最大值</span><span>标签</span></div>
      {rules.map((rule, index) => (
        <div className="mapping-grid" key={`${rule.label}-${index}`}>
          <input type="number" value={rule.min} onChange={(event) => {
            const next = [...rules];
            next[index] = { ...rule, min: Number(event.target.value) };
            onChange(next);
          }} />
          <input type="number" value={rule.max} onChange={(event) => {
            const next = [...rules];
            next[index] = { ...rule, max: Number(event.target.value) };
            onChange(next);
          }} />
          <input value={rule.label} onChange={(event) => {
            const next = [...rules];
            next[index] = { ...rule, label: event.target.value };
            onChange(next);
          }} />
        </div>
      ))}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
