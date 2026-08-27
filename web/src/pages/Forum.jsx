import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, TextField, TextareaAutosize, IconButton, Alert, Box } from '@mui/material';
import { ArrowUpward, ArrowDownward } from '@mui/icons-material';
import { api } from '../api';
import { timeAgo } from '../util';

const textareaStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px 12px',
  fontSize: '.95rem',
  fontFamily: 'inherit',
  resize: 'vertical',
};

export default function Forum() {
  const { id } = useParams();
  const threadId = id ? Number(id) : null;
  const navigate = useNavigate();

  return (
    <>
      <div className="page-head">
        <div><h1>Forum</h1><p>Suggestions, bug reports, and nix-related discourse.</p></div>
        <Box className="head-actions">
          {!threadId && <NewThreadButton onCreated={(tid) => navigate(`/forum/thread/${tid}`)} />}
        </Box>
      </div>
      {threadId ? <ThreadDetail id={threadId} onBack={() => navigate('/forum')} /> : <ThreadList />}
    </>
  );
}

function ThreadList() {
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(() => {
    api('/api/forum/threads').then((r) => {
      if (!r || r.status >= 400) setError('load failed');
      else setThreads(r.data);
    });
  }, []);

  useEffect(load, [load]);

  if (error) return <div className="error">{error}</div>;
  if (!threads) return null;

  return (
    <section className="card">
      <h2>Threads</h2>
      {threads.length ? (
        <ul className="thread-list">
          {threads.map((t) => (
            <li className="thread-row" key={t.id}>
              <div className="thread-main" onClick={() => navigate(`/forum/thread/${t.id}`)}>
                <a className="thread-title" href={`/forum/thread/${t.id}`} onClick={(e) => e.preventDefault()}>{t.title}</a>
                <div className="thread-meta">
                  <span className="thread-author">{t.author}</span>
                  <span className="dot">·</span>
                  <span className="thread-time">{timeAgo(t.created_at)}</span>
                  <span className="dot">·</span>
                  <span className="thread-replies">{t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}</span>
                </div>
              </div>
              <VotePill type="thread" id={t.id} score={t.score} myVote={t.myVote || 0} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No threads yet. Be the first to post!</p>
      )}
    </section>
  );
}

function NewThreadButton({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (title.trim().length < 3 || body.trim().length < 3) { setError('Title and body need at least 3 characters.'); return; }
    const r = await api('/api/forum/threads', { method: 'POST', body: JSON.stringify({ title, body }) });
    if (r.ok === false) return;
    if (r.status >= 400) { setError(r.data.error || 'Failed to post'); return; }
    onCreated(r.data.id);
  }

  if (!open) return <Button variant="contained" type="button" onClick={() => setOpen(true)}>+ New Thread</Button>;

  return (
    <section className="card">
      <h2>New Thread</h2>
      {error && <Alert severity="error" className="error">{error}</Alert>}
      <form onSubmit={submit}>
        <Box className="row" sx={{ mt: 1.5 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Title"
            slotProps={{ htmlInput: { maxLength: 200 } }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Box>
        <Box className="row" sx={{ mt: 1.5 }}>
          <TextareaAutosize
            minRows={4}
            maxLength={5000}
            placeholder="What's on your mind?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={textareaStyle}
          />
        </Box>
        <Box className="row" sx={{ mt: 2 }}>
          <Button variant="contained" type="submit">Post Thread</Button>
          <Button variant="outlined" type="button" onClick={() => setOpen(false)}>Cancel</Button>
        </Box>
      </form>
    </section>
  );
}

function ThreadDetail({ id, onBack }) {
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState('');

  useEffect(() => {
    api(`/api/forum/threads/${id}`).then((r) => {
      if (r && r.status < 400) setThread(r.data);
      else onBack();
    });
  }, [id, onBack]);

  if (!thread) return null;

  async function postReply(e) {
    e.preventDefault();
    if (reply.trim().length < 2) return;
    const r = await api(`/api/forum/threads/${id}/reply`, { method: 'POST', body: JSON.stringify({ body: reply }) });
    if (r.status === 201) {
      setReply('');
      const res = await api(`/api/forum/threads/${id}`);
      if (res && res.status < 400) setThread(res.data);
    }
  }

  return (
    <section className="card">
      <Box className="td-back">
        <Button variant="outlined" size="small" onClick={onBack}>&larr; All threads</Button>
      </Box>
      <article className="td-post">
        <div className="td-head">
          <h2 className="td-title">{thread.title}</h2>
          <VotePill type="thread" id={thread.id} score={thread.score} myVote={thread.myVote || 0} />
        </div>
        <div className="td-meta">
          <span className="thread-author">{thread.author}</span>
          <span className="dot">·</span>
          <span className="thread-time">{timeAgo(thread.created_at)}</span>
        </div>
        <div className="td-body">{thread.body}</div>
      </article>

      <div className="td-replies">
        <h3 className="td-replies-h">{thread.replies.length} {thread.replies.length === 1 ? 'Reply' : 'Replies'}</h3>
        {thread.replies.length ? thread.replies.map((rep) => (
          <div className="reply" id={`reply-${rep.id}`} key={rep.id}>
            <div className="reply-main">
              <div className="reply-head">
                <b className="reply-author">{rep.author}</b>
                <span className="dot">·</span>
                <span className="reply-time">{timeAgo(rep.created_at)}</span>
              </div>
              <div className="reply-text">{rep.body}</div>
            </div>
            <VotePill type="reply" id={rep.id} score={rep.score} myVote={rep.myVote || 0} />
          </div>
        )) : <p className="td-no-replies">No replies yet.</p>}
      </div>

      <form className="td-reply-form" onSubmit={postReply}>
        <TextareaAutosize
          minRows={2}
          maxLength={5000}
          placeholder="Write a reply…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          required
          style={textareaStyle}
        />
        <Box className="td-reply-actions">
          <Button variant="contained" type="submit">Reply</Button>
        </Box>
      </form>
    </section>
  );
}

function VotePill({ type, id, score, myVote }) {
  const [state, setState] = useState({ score, voted: myVote || 0 });

  // Re-sync when the loaded thread/reply changes (e.g. navigation, reply posted).
  useEffect(() => { setState({ score, voted: myVote || 0 }); }, [score, myVote]);

  async function doVote(direction) {
    const r = await api('/api/forum/vote', {
      method: 'POST',
      body: JSON.stringify({ targetType: type, targetId: id, direction }),
    });
    if (!r || r.status >= 400) return;
    setState(r.data);
  }

  // The voted state is shown via the .vp-up.on / .vp-down.on classes in
  // style.css: the global `.vote-pill button` rule outranks MUI's emotion
  // classes, so a MUI `color` prop on the IconButton never wins.
  return (
    <span className="vote-pill">
      <IconButton
        size="small"
        aria-label="Upvote"
        aria-pressed={state.voted === 1}
        className={`vp-up${state.voted === 1 ? ' on' : ''}`}
        onClick={() => doVote(1)}
      >
        <ArrowUpward fontSize="small" />
      </IconButton>
      <span className={`vote-score${state.score > 0 ? ' pos' : state.score < 0 ? ' neg' : ''}`}>{state.score}</span>
      <IconButton
        size="small"
        aria-label="Downvote"
        aria-pressed={state.voted === -1}
        className={`vp-down${state.voted === -1 ? ' on' : ''}`}
        onClick={() => doVote(-1)}
      >
        <ArrowDownward fontSize="small" />
      </IconButton>
    </span>
  );
}
