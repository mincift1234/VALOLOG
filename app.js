// app.js — 신고/이의/알림 전체 운영(관리자 승인·반려, 이의 수용·반려, 실시간 알림)
// Fix: 로그인 후 관리자 watcher 시작 + 초기가격 배지 카운트, 승인/반려 후 즉시 배지 갱신

/* ---------------- Firebase ---------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where,
  doc, updateDoc, onSnapshot, deleteDoc, getDoc, getCountFromServer, startAt, endAt, startAfter
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCcXriOZeqTu5425ywqujvqONDVGuVNsdE",
  authDomain: "valtroll-6a039.firebaseapp.com",
  projectId: "valtroll-6a039",
  storageBucket: "valtroll-6a039.firebasestorage.app",
  messagingSenderId: "160168818035",
  appId: "1:160168818035:web:67eb7990acf2ec8b150106",
  measurementId: "G-0E33J5WSD7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- Utils ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
const escapeAttr = (s) => String(s || "").replace(/"/g, "&quot;");
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const toast = (msg, ok = true) => {
  const t = $("#toast"); if (!t) { alert(msg); return; }
  t.textContent = msg; t.classList.remove("hidden", "ok", "err"); t.classList.add("show", ok ? "ok" : "err");
  setTimeout(() => t.classList.remove("show"), 2000);
};
const isValidHttpUrl = (u) => { try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:"; } catch { return false; } };
const normRiotId = (s) => String(s || "").trim().toLowerCase();

/* ---------------- Global state ---------------- */
let isAdmin = false;
let unsubscribePending = null, lastPendingSnap = null;
let unsubscribeAppeals = null, lastAppealSnap = null;
let unsubscribeNoti = null;

/* ---------------- Lookup: DOM & state ---------------- */
const resultBox = $("#resultList");
const qInput = $("#q");
const moreBtn = $("#btnMore");
let lookupCursor = null;
let lookupKeyword = "";
let lookupMode = "createdAt";

/* ---------------- Helpers ---------------- */
async function hasRecentSame(uid, riotIdNorm, minutes = 60 * 24) {
  try {
    const s = await getDocs(query(
      collection(db, "reports"),
      where("createdBy", "==", uid),
      where("riotIdNorm", "==", riotIdNorm),
      orderBy("createdAt", "desc"),
      limit(1)
    ));
    if (s.empty) return false;
    const lastAt = s.docs[0].data().createdAt?.toDate?.() || new Date(0);
    return (Date.now() - lastAt.getTime()) / 60000 < minutes;
  } catch (e) { console.warn("[hasRecentSame]", e); return false; }
}

/** 관리자 배지 한 번만 정확 카운트로 갱신 */
async function loadAdminCountsOnce() {
  const badge = $("#adminBadge"); if (!badge) return;
  try {
    const p = await getCountFromServer(query(collection(db, "reports"), where("status", "==", "pending")));
    const a = await getCountFromServer(query(collection(db, "appeals"), where("status", "==", "submitted")));
    const total = (p.data().count || 0) + (a.data().count || 0);
    badge.textContent = String(total);
    badge.classList.toggle("hidden", total === 0);
  } catch (e) {
    // 못 불러오면 스냅샷 기반 값 유지
    updateAdminBadgeCount();
  }
}

/* ---------------- Lookup functions ---------------- */
async function runLookup(reset = false) {
  if (!resultBox) return;
  if (reset) { resultBox.innerHTML = '<div class="result-meta">불러오는 중...</div>'; lookupCursor = null; }
  const kw = (lookupKeyword || "").toLowerCase().trim();

  let snap, items;
  try {
    if (kw) {
      const riotKw = kw.includes("#") ? kw : kw + "#";
      const qref = query(
        collection(db, "reports"),
        where("status", "==", "approved"),
        orderBy("riotIdNorm"),
        startAt(riotKw), endAt(riotKw + "\uf8ff"),
        ...(lookupCursor ? [startAfter(lookupCursor)] : []),
        limit(20)
      );
      snap = await getDocs(qref);
      lookupMode = "riot";
      items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(x => (x.description || "").toLowerCase().includes(kw) || (x.riotId || "").toLowerCase().includes(kw));
    } else {
      const qref = query(
        collection(db, "reports"),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc"),
        ...(lookupCursor ? [startAfter(lookupCursor)] : []),
        limit(20)
      );
      snap = await getDocs(qref);
      lookupMode = "createdAt";
      items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    console.warn("[runLookup fallback]", e);
    const qref = query(collection(db, "reports"), where("status", "==", "approved"), orderBy("createdAt", "desc"),
      ...(lookupCursor ? [startAfter(lookupCursor)] : []), limit(20));
    snap = await getDocs(qref);
    lookupMode = "createdAt";
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const kw2 = kw;
    if (kw2) items = items.filter(x => (x.description || "").toLowerCase().includes(kw2) || (x.riotId || "").toLowerCase().includes(kw2));
  }

  lookupCursor = snap.docs[snap.docs.length - 1] || null;
  moreBtn?.classList.toggle("hidden", snap.empty || !lookupCursor);
  renderResults(items, reset);
}

function wireLookupUI() {
  if (qInput) {
    const onType = debounce(() => { lookupKeyword = qInput.value.trim(); runLookup(true).catch(e => toast("검색 실패: " + e.message, false)); }, 250);
    qInput.addEventListener("input", onType);
  }
  moreBtn?.addEventListener("click", () => { runLookup(false).catch(e => toast("더 보기 실패: " + e.message, false)); });
}

async function firstLoadLookup() { lookupKeyword = ""; await runLookup(true); }

function renderResults(items, initial) {
  if (!resultBox) return;
  if (initial) resultBox.innerHTML = "";
  if (items.length === 0 && initial) { resultBox.innerHTML = '<div class="result-meta">결과가 없습니다.</div>'; return; }
  items.forEach((d) => {
    const el = document.createElement("div");
    el.className = "result-card";
    const dateStr = d.createdAt?.toDate?.() ? d.createdAt.toDate().toLocaleString() : "";
    el.innerHTML = `
      <div class="result-top">
        <div class="result-name">${escapeHtml(d.riotId || "-")}</div>
        <div class="result-cat">${escapeHtml(d.category || "기타")}</div>
      </div>
      <div class="result-desc">${escapeHtml(d.description || "")}</div>
      <div class="result-meta">${dateStr}
        ${d.proof ? ` · <a class="result-proof" href="${escapeAttr(d.proof)}" target="_blank" rel="noopener">증거</a>` : ""}
      </div>
      ${isAdmin ? `<div style="margin-top:8px">
        <button class="btn-submit btn-danger" data-act="delete-approved" data-id="${d.id}">삭제</button>
      </div>` : ``}
    `;
    resultBox.appendChild(el);
  });
}

if (resultBox) {
  resultBox.addEventListener("click", async (e) => {
    const btn = e.target.closest('button[data-act="delete-approved"]');
    if (!btn) return;
    if (!isAdmin) { toast("관리자만 가능합니다.", false); return; }
    const id = btn.dataset.id;
    if (!confirm("이 승인된 신고를 삭제할까요? 되돌릴 수 없습니다.")) return;

    const card = btn.closest(".result-card");
    if (card) card.remove();
    try { await deleteDoc(doc(db, "reports", id)); toast("삭제 완료"); }
    catch (err) { toast("삭제 실패: " + err.message, false); }
    finally {
      if (!resultBox.querySelector(".result-card")) {
        resultBox.innerHTML = '<div class="result-meta">결과가 없습니다。</div>';
      }
    }
  });
}

/* ---------------- Nav ---------------- */
const container = document.querySelector(".main-container");
function activatePage(page) {
  $$(".page").forEach((p) => p.classList.remove("page-active"));
  $$(".nav-link").forEach((a) => a.classList.remove("active"));
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add("active");
  document.getElementById(`page-${page}`)?.classList.add("page-active");

  if (page === "report") {
    $("#heroTitle").textContent = "트롤 등록";
    $("#heroDesc").textContent = "닉네임, 유형, 설명을 적고 증거 링크를 첨부해주세요.";
    $("#statsColumn").style.display = ""; container.classList.remove("single");
  } else if (page === "appeal") {
    $("#heroTitle").textContent = "이의 신청";
    $("#heroDesc").textContent = "오해가 있었다면 근거를 첨부해 설명해주세요.";
    $("#statsColumn").style.display = "none"; container.classList.add("single");
  } else if (page === "lookup") {
    $("#heroTitle").textContent = "트롤 조회";
    $("#heroDesc").textContent = "닉네임/설명으로 검색하고 더 보기로 이어보세요.";
    $("#statsColumn").style.display = "none"; container.classList.add("single");
    firstLoadLookup();
  } else if (page === "admin") {
    $("#heroTitle").textContent = "관리자 승인";
    $("#heroDesc").textContent = "승인 대기 중인 신고 & 이의 신청을 처리합니다.";
    $("#statsColumn").style.display = "none"; container.classList.add("single");
    if (lastPendingSnap) renderPendingFromSnapshot(lastPendingSnap); else loadPending();
    if (lastAppealSnap) renderAppealsFromSnapshot(lastAppealSnap);
  }
}
function wireNavLinks() {
  $$(".nav-link").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); activatePage(a.dataset.page); }));
}

/* ---------------- Auth ---------------- */
$("#btnLogin")?.addEventListener("click", async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { toast("로그인 실패: " + e.message, false); } });
$("#btnLogout")?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    $("#btnLogin")?.classList.add("hidden"); $("#btnLogout")?.classList.remove("hidden");
    const token = await user.getIdTokenResult(true);
    isAdmin = token.claims?.role === "admin";
    toggleAdminTab(isAdmin);

    // ★ 관리자일 때만 실시간 watcher 시작 + 초기 배지 채우기
    if (isAdmin) {
      startPendingWatch();
      startAppealWatch();
      loadAdminCountsOnce().catch(() => {});
    } else {
      stopPendingWatch();
      stopAppealWatch();
    }

    startNotificationWatch(user.uid);
  } else {
    $("#btnLogin")?.classList.remove("hidden"); $("#btnLogout")?.classList.add("hidden");
    isAdmin = false; toggleAdminTab(false);
    stopNotificationWatch(); stopPendingWatch(); stopAppealWatch();
  }
});

/* ---------------- Notifications ---------------- */
function startNotificationWatch(uid) {
  stopNotificationWatch();
  const q = query(collection(db, "notifications"), where("userId", "==", uid), where("read", "==", false), limit(20));
  unsubscribeNoti = onSnapshot(q, (snap) => {
    const changes = [...snap.docChanges()].sort((a, b) => {
      const at = a.doc.data().createdAt?.toDate?.()?.getTime?.() || 0;
      const bt = b.doc.data().createdAt?.toDate?.()?.getTime?.() || 0;
      return at - bt;
    });
    changes.forEach((c) => {
      if (c.type === "added") {
        const x = c.doc.data();
        toast(x.message || "새 알림이 있습니다.");
        updateDoc(doc(db, "notifications", c.doc.id), { read: true }).catch((e) => console.warn("[noti read fail]", e));
      }
    });
  }, (err) => console.error("[noti watch]", err));
}
function stopNotificationWatch() { if (unsubscribeNoti) { unsubscribeNoti(); unsubscribeNoti = null; } }
function toggleAdminTab(on) {
  const nav = document.querySelector('.nav-link[data-page="admin"]')?.parentElement;
  if (!nav) return; nav.style.display = on ? "" : "none"; updateAdminBadgeCount();
}
function updateAdminBadgeCount() {
  const badge = $("#adminBadge"); if (!badge) return;
  const pending = lastPendingSnap?.size || 0;
  const appeals = lastAppealSnap?.size || 0;
  const total = pending + appeals;
  badge.textContent = String(total);
  badge.classList.toggle("hidden", total === 0);
}

/* ---------------- Report submit ---------------- */
$("#btnReport")?.addEventListener("click", async () => {
  const btn = $("#btnReport");
  const riotId = $("#rRiotId").value.trim();
  const category = $("#rCategory").value.trim();
  const desc = $("#rDesc").value.trim();
  const proof = $("#rProof").value.trim();
  if (!riotId || !category || !desc) { toast("필수 항목을 입력하세요.", false); return; }
  if (proof && !isValidHttpUrl(proof)) { toast("증거 링크가 올바르지 않습니다.", false); return; }

  try {
    const dupSnap = await getDocs(query(collection(db, "reports"), where("status", "==", "approved"), where("riotId", "==", riotId), limit(1)));
    if (!dupSnap.empty) { if (!confirm("이미 신고된 닉네임입니다. 그래도 등록할까요?")) return; }
  } catch (_) {}

  btn.disabled = true;
  try {
    const riotIdNorm = normRiotId(riotId);
    if (auth.currentUser && (await hasRecentSame(auth.currentUser.uid, riotIdNorm))) {
      toast("같은 대상에 대한 최근 신고가 있어요. 잠시 후 다시 시도하세요.", false); btn.disabled = false; return;
    }
    await addDoc(collection(db, "reports"), {
      riotId, riotIdNorm, category, description: desc, proof,
      createdAt: serverTimestamp(), createdBy: auth.currentUser ? auth.currentUser.uid : null, status: "pending"
    });
    toast("등록 완료! (관리자 승인 대기)");
    $("#rRiotId").value = ""; $("#rCategory").value = ""; $("#rDesc").value = ""; $("#rProof").value = "";
  } catch (e) { toast("등록 실패: " + e.message, false); }
  finally { btn.disabled = false; }
});

/* ---------------- Appeal submit ---------------- */
$("#btnAppeal")?.addEventListener("click", async () => {
  const btn = $("#btnAppeal");
  const riotId = $("#aRiotId").value.trim();
  const reason = $("#aReason").value.trim();
  const proof = $("#aProof").value.trim();
  if (!riotId || !reason) { toast("필수 항목을 입력하세요.", false); return; }
  if (proof && !isValidHttpUrl(proof)) { toast("증거 링크가 올바르지 않습니다.", false); return; }

  btn.disabled = true;
  try {
    let reportOwnerId = null;
    try {
      const s = await getDocs(query(collection(db, "reports"),
        where("status", "==", "approved"), where("riotId", "==", riotId),
        orderBy("createdAt", "desc"), limit(1)));
      if (!s.empty) reportOwnerId = s.docs[0].data().createdBy || null;
    } catch (_) {}
    await addDoc(collection(db, "appeals"), {
      riotId, reason, proof, status: "submitted",
      createdAt: serverTimestamp(), createdBy: auth.currentUser ? auth.currentUser.uid : null, reportOwnerId: reportOwnerId || null
    });
    toast("이의 신청이 접수되었습니다.");
    $("#aRiotId").value = ""; $("#aReason").value = ""; $("#aProof").value = "";
  } catch (e) { toast("제출 실패: " + e.message, false); }
  finally { btn.disabled = false; }
});

/* ---------------- Stats ---------------- */
async function refreshStats() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);

  const snap = await getDocs(query(collection(db, "reports"), where("status", "==", "approved"), orderBy("createdAt", "desc"), limit(300)));
  let today = 0, week = 0;
  snap.forEach((d) => {
    const t = d.data().createdAt?.toDate?.() || new Date(0);
    if (t >= todayStart) today++; if (t >= weekAgo) week++;
  });

  try {
    const qTotal = query(collection(db, "reports"), where("status", "==", "approved"));
    const c = await getCountFromServer(qTotal);
    $("#totalCount").textContent = c.data().count;
  } catch { $("#totalCount").textContent = snap.size; }
  $("#todayCount").textContent = today; $("#weekCount").textContent = week;
}

/* ---------------- Admin: Pending ---------------- */
async function loadPending() {
  try {
    const snap = await getDocs(query(collection(db, "reports"), where("status", "==", "pending"), orderBy("createdAt", "asc"), limit(50)));
    lastPendingSnap = snap; renderPendingFromSnapshot(snap); updateAdminBadgeCount();
  } catch (err) {
    console.error("[loadPending]", err);
    const box = $("#pendingList"); if (box) box.innerHTML = `<div class="result-meta">에러: ${err.message}</div>`;
  }
}
function renderPendingFromSnapshot(snap) {
  const box = $("#pendingList"); if (!box) return;
  box.innerHTML = "";
  if (snap.empty) { box.innerHTML = '<div class="result-meta">승인 대기 문서가 없습니다.</div>'; return; }
  snap.forEach((d) => {
    const x = d.data(); const dateStr = x.createdAt?.toDate?.() ? x.createdAt.toDate().toLocaleString() : "";
    const el = document.createElement("div");
    el.className = "result-card";
    el.innerHTML = `
      <div class="result-top">
        <div class="result-name">${escapeHtml(x.riotId || "-")}</div>
        <div class="result-cat">대기</div>
      </div>
      <div class="result-desc">${escapeHtml(x.description || "")}</div>
      <div class="result-meta">${dateStr}
        ${x.proof ? ` · <a class="result-proof" href="${escapeAttr(x.proof)}" target="_blank" rel="noopener">증거</a>` : ""}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-submit" data-act="approve" data-id="${d.id}">승인</button>
        <button class="btn-submit" style="background:#354455" data-act="reject" data-id="${d.id}">반려</button>
      </div>`;
    box.appendChild(el);
  });

  box.onclick = async (e) => {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    if (!isAdmin) { toast("관리자만 가능합니다.", false); return; }

    const id = btn.dataset.id; const act = btn.dataset.act;
    const card = btn.closest(".result-card"); if (card) card.remove(); // 즉시 제거(낙관적)
    try {
      const ref = doc(db, "reports", id); const cur = await getDoc(ref);
      const data = cur.exists() ? cur.data() : null; if (!data) throw new Error("문서를 찾을 수 없습니다.");

      if (act === "approve") {
        await updateDoc(ref, { status: "approved", approvedAt: serverTimestamp() });
        if (data.createdBy) await addDoc(collection(db, "notifications"), {
          userId: data.createdBy, type: "report-approved",
          message: `[승인됨] ${data.riotId} 신고가 승인되었습니다.`, read: false, createdAt: serverTimestamp()
        });
      } else if (act === "reject") {
        const reason = prompt("반려 사유를 입력하세요."); if (!reason) { loadPending(); return; }
        await updateDoc(ref, { status: "rejected", rejectedAt: serverTimestamp(), rejectReason: reason });
        if (data.createdBy) await addDoc(collection(db, "notifications"), {
          userId: data.createdBy, type: "report-rejected",
          message: `[반려됨] ${data.riotId} 신고가 반려되었습니다. 사유: ${reason}`, read: false, createdAt: serverTimestamp()
        });
      }

      // 즉시 배지 갱신(정확 카운트)
      loadAdminCountsOnce().catch(() => updateAdminBadgeCount());
      if (!box.querySelector(".result-card")) box.innerHTML = '<div class="result-meta">승인 대기 문서가 없습니다.</div>';
    } catch (err) { console.error("[pending action]", err); toast("처리 실패: " + err.message, false); }
  };
}

/* ---------------- Admin: realtime watchers ---------------- */
function startPendingWatch() {
  if (unsubscribePending) return;
  const q = query(collection(db, "reports"), where("status", "==", "pending"), orderBy("createdAt", "asc"));
  unsubscribePending = onSnapshot(q, (snap) => {
    lastPendingSnap = snap; const opened = $("#page-admin")?.classList.contains("page-active");
    if (opened) renderPendingFromSnapshot(snap);
    updateAdminBadgeCount(); // 실시간 배지 갱신
  }, (err) => console.error("[pending watch]", err));
}
function stopPendingWatch() { if (unsubscribePending) { unsubscribePending(); unsubscribePending = null; } }

function startAppealWatch() {
  if (unsubscribeAppeals) return;
  const q = query(collection(db, "appeals"), where("status", "==", "submitted"), orderBy("createdAt", "asc"));
  unsubscribeAppeals = onSnapshot(q, (snap) => {
    lastAppealSnap = snap; const opened = $("#page-admin")?.classList.contains("page-active");
    if (opened) renderAppealsFromSnapshot(snap);
    updateAdminBadgeCount(); // 실시간 배지 갱신
  }, (err) => console.error("[appeal watch]", err));
}
function stopAppealWatch() { if (unsubscribeAppeals) { unsubscribeAppeals(); unsubscribeAppeals = null; } }

/* ---------------- Admin: appeals ---------------- */
function renderAppealsFromSnapshot(snap) {
  const box = $("#appealList"); if (!box) return;
  box.innerHTML = "";
  if (snap.empty) { box.innerHTML = '<div class="result-meta">이의 신청이 없습니다.</div>'; return; }
  snap.forEach((d) => {
    const x = d.data(); const dateStr = x.createdAt?.toDate?.() ? x.createdAt.toDate().toLocaleString() : "";
    const el = document.createElement("div");
    el.className = "result-card";
    el.innerHTML = `
      <div class="result-top">
        <div class="result-name">${escapeHtml(x.riotId || "-")}</div>
        <div class="result-cat">이의</div>
      </div>
      <div class="result-desc">${escapeHtml(x.reason || "")}</div>
      <div class="result-meta">${dateStr}
        ${x.proof ? ` · <a class="result-proof" href="${escapeAttr(x.proof)}" target="_blank" rel="noopener">증거</a>` : ""}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-submit" data-act="appeal-accept" data-id="${d.id}">이의 수용</button>
        <button class="btn-submit" style="background:#354455" data-act="appeal-reject" data-id="${d.id}">반려</button>
      </div>`;
    box.appendChild(el);
  });

  box.onclick = async (e) => {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    if (!isAdmin) { toast("관리자만 가능합니다.", false); return; }

    const id = btn.dataset.id; const act = btn.dataset.act;
    const card = btn.closest(".result-card"); if (card) card.remove();
    try {
      const ref = doc(db, "appeals", id); const cur = await getDoc(ref);
      const data = cur.exists() ? cur.data() : null; if (!data) throw new Error("문서를 찾을 수 없습니다.");

      if (act === "appeal-accept") {
        await updateDoc(ref, { status: "accepted", processedAt: serverTimestamp() });
        if (data.createdBy) await addDoc(collection(db, "notifications"), {
          userId: data.createdBy, type: "appeal-accepted",
          message: `[이의 수용] ${data.riotId} 건 이의가 수용되었습니다.`, read: false, createdAt: serverTimestamp()
        });
      } else if (act === "appeal-reject") {
        const reason = prompt("이의 반려 사유를 입력하세요."); if (!reason) { if (lastAppealSnap && !lastAppealSnap.empty) renderAppealsFromSnapshot(lastAppealSnap); else box.innerHTML = '<div class="result-meta">이의 신청이 없습니다.</div>'; updateAdminBadgeCount(); return; }
        await updateDoc(ref, { status: "rejected", processedAt: serverTimestamp(), rejectReason: reason });
        if (data.createdBy) await addDoc(collection(db, "notifications"), {
          userId: data.createdBy, type: "appeal-rejected",
          message: `[이의 반려] ${data.riotId} 건 이의가 반려되었습니다. 사유: ${reason}`, read: false, createdAt: serverTimestamp()
        });
      }

      loadAdminCountsOnce().catch(() => updateAdminBadgeCount());
      if (!box.querySelector(".result-card")) box.innerHTML = '<div class="result-meta">이의 신청이 없습니다.</div>';
    } catch (err) { console.error("[appeal action]", err); toast("처리 실패: " + err.message, false); }
  };
}

/* ---------------- Boot ---------------- */
wireNavLinks();
wireLookupUI();
const initial = document.querySelector(".nav-link.active")?.dataset.page || "report";
activatePage(initial);
if (initial === "report") { refreshStats().catch(() => {}); }
// 주의: watcher는 로그인 후 onAuthStateChanged에서 시작
