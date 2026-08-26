'use strict';
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data', 'nix.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
console.log('[migrate] Running…');
db.exec(`
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT NOT NULL, icon TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'nixing');
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, achievement_id));
CREATE TABLE IF NOT EXISTS user_xp (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_xp INTEGER NOT NULL DEFAULT 0, season_xp INTEGER NOT NULL DEFAULT 0,
  season TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS bp_claims (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season TEXT NOT NULL, tier INTEGER NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, season, tier));
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS votes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('thread','reply')),
  target_id INTEGER NOT NULL, direction INTEGER NOT NULL CHECK(direction IN (1,-1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_type, target_id));
CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_type, target_id);
`);
console.log('[migrate] Tables OK');
const ACHS=[
[1,'first_nix','First Blood','Give your first nix','⚡','nixing'],
[2,'first_received','Famous','Receive your first nix','⭐','receiving'],
[3,'nix_10','Getting Warm','Give 10 nixes','🔥','nixing'],
[4,'nix_25','Serial Nixer','Give 25 nixes','💥','nixing'],
[5,'nix_50','Nix Machine','Give 50 nixes','⚙️','nixing'],
[6,'nix_100','Centurion','Give 100 nixes','🏛️','nixing'],
[7,'received_10','Notorious','Get nixed 10 times','👀','receiving'],
[8,'received_25','Villain','Get nixed 25 times','😈','receiving'],
[9,'social_butterfly','Social Butterfly','Nix 5 different users','🦋','social'],
[10,'nemesis','Nemesis','Get nixed 3+ times by the same user','💀','nemesis'],
[11,'revenge','Revenge','Nix your current nemesis','⚔️','nemesis'],
[12,'top_dog','Top Dog','Be the #1 most-nixed user','👑','prestige'],
[13,'collector','Collector','Unlock 5 achievements','🎒','meta'],
[14,'veteran','Veteran','Have nixes spanning 30+ days','📅','meta'],
[15,'completionist','Completionist','Unlock every achievement','🏆','meta']];
const ins=db.prepare('INSERT OR IGNORE INTO achievements (id,key,name,description,icon,category) VALUES (?,?,?,?,?,?)');
db.transaction(()=>{for(const a of ACHS)ins.run(...a)})();
console.log('[migrate] '+ACHS.length+' achievements');
const season=new Date().toISOString().slice(0,7);
const nixes=db.prepare('SELECT nixer_id,nixed_id FROM nixes').all();
const up=db.prepare('INSERT INTO user_xp (user_id,total_xp,season_xp,season) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET total_xp=total_xp+excluded.total_xp');
db.transaction(()=>{const x={};for(const n of nixes){x[n.nixer_id]=(x[n.nixer_id]||0)+50;x[n.nixed_id]=(x[n.nixed_id]||0)+20}for(const[u,v]of Object.entries(x))up.run(+u,v,0,season)})();
console.log('[migrate] XP backfill: '+nixes.length+' nixes');
console.log('[migrate] Done.');
db.close();
