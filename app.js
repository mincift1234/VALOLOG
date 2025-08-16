/* ---------------- Firebase ---------------- */
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    limit,
    getDocs,
    where,
    doc,
    updateDoc,
    setDoc,
    runTransaction,
    onSnapshot,
    deleteDoc,
    getDoc,
    getCountFromServer,
    startAt,
    endAt,
    startAfter
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ---------------- Config ---------------- */
const firebaseConfig = {
    apiKey: "AIzaSyCcXriOZeqTu5425ywqujvqONDVGuVNsdE",
    authDomain: "valtroll-6a039.firebaseapp.com",
    projectId: "valtroll-6a039",
    storageBucket: "valtroll-6a039.firebasestorage.app",
    messagingSenderId: "160168818035",
    appId: "1:160168818035:web:67eb7990acf2ec8b150106",
    measurementId: "G-0E33J5WSD7"
};
let appInstance;
try {
    appInstance = getApp();
} catch {
    appInstance = initializeApp(firebaseConfig);
}
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);

/* ---------------- Utils ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const escapeHtml = (s) =>
    String(s || "").replace(
        /[&<>"']/g,
        (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
    );
const escapeAttr = (s) => String(s || "").replace(/"/g, "&quot;");
const debounce = (fn, ms) => {
    let t;
    return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
    };
};
const toast = (msg, ok = true) => {
    const t = $("#toast");
    if (!t) return alert(msg);
    t.textContent = msg;
    t.classList.remove("hidden", "ok", "err");
    t.classList.add("show", ok ? "ok" : "err");
    setTimeout(() => t.classList.remove("show"), 2000);
};
const isValidHttpUrl = (u) => {
    try {
        const x = new URL(u);
        return x.protocol === "http:" || x.protocol === "https:";
    } catch {
        return false;
    }
};
const normRiotId = (s) =>
    String(s || "")
        .trim()
        .toLowerCase();

const cssEscape = window.CSS && CSS.escape ? CSS.escape : (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");

/* ---------------- Global state ---------------- */
let isAdmin = false;
let unsubscribePending = null,
    lastPendingSnap = null;
let unsubscribeAppeals = null,
    lastAppealSnap = null;
let unsubscribeNoti = null;

/* nickname cache */
let myNickname = null;
let myNicknameLower = null;

/* 댓글 watcher 관리 */
const commentUnsubs = new Map(); // reports/{id}/comments
const routineCommentUnsubs = new Map(); // routines/{id}/comments
// 클릭 핸들러 중복 방지 플래그
let routineHandlersBound = false;

/* ---------------- Lookup: DOM & state ---------------- */
const resultBox = $("#resultList");
const qInput = $("#q");
const moreBtn = $("#btnMore");
let lookupCursor = null;
let lookupKeyword = "";

/* ---------------- Routines: DOM & state ---------------- */
const rForm = {
    tier: $("#rtTier"),
    platform: $("#rtPlatform"),
    title: $("#rtTitle"),
    playlist: $("#rtPlaylist"),
    desc: $("#rtDesc"),
    submit: $("#btnRoutineSubmit")
};
const rListBox = $("#routineList");
const rMoreBtn = $("#btnRoutineMore");
const rQueryInput = $("#rq");
let routineCursor = null;
let routineKw = "";

/* ---------------- Profanity & nickname rules ---------------- */
const PROFANITY = [
    "fuck",
    "shit",
    "bitch",
    "asshole",
    "dick",
    "cunt",
    "niga",
    "wtf",
    "좆",
    "씨발",
    "ㅅㅂ",
    "ㅆㅂ",
    "병신",
    "미친놈",
    "개새끼",
    "개색기",
    "년",
    "좇",
    "씹",
    "니애미",
    "ㄴㅇㅁ",
    "노무현",
    "이재명",
    "윤석열",
    "박근혜",
    "문재인"
].map((x) => x.toLowerCase());

function containsProfanity(s = "") {
    const t = String(s).toLowerCase();
    return PROFANITY.some((w) => t.includes(w));
}
async function fetchMyProfile(uid) {
    if (!uid) return null;
    const ref = doc(db, "profiles", uid);
    const d = await getDoc(ref);
    return d.exists() ? d.data() : null;
}

// 구버전(document.description/playlistUrl/createdByName)과 신버전 통합
function normalizeRoutine(r) {
    return {
        ...r,
        desc: r.desc ?? r.description ?? "",
        playlist: r.playlist ?? r.playlistUrl ?? "",
        createdByNick: r.createdByNick ?? r.createdByName ?? ""
    };
}

/* ---------------- Nickname Modal (UI 주입) ---------------- */
function ensureNicknameModal() {
    if ($("#nickModal")) return;
    const wrap = document.createElement("div");
    wrap.id = "nickModal";
    wrap.style.cssText =
        "position:fixed; inset:0; display:none; place-items:center; z-index:3000; background:rgba(0,0,0,0.5);";
    wrap.innerHTML = `
    <div style="width:min(420px,92%); background:#0f1a26; color:#e8eef6; border:1px solid rgba(255,255,255,0.08);
                border-radius:12px; padding:16px 16px 14px; box-shadow:0 18px 40px rgba(0,0,0,.55)">
      <h3 style="margin:0 0 10px; font-size:18px; font-weight:800">닉네임 설정</h3>
      <p style="margin:0 0 12px; color:#a9b4c0; font-size:13px">
        사이트에서 사용할 닉네임을 정하세요. <b>비속어 금지</b>, <b>중복 불가</b> (3~16자, 영문/숫자/한글/언더스코어).
      </p>
      <input id="nickInput" type="text" placeholder="예) valoplayer_123"
             class="nick-input" style="width:100%; padding:12px; border:none; border-radius:10px; background:#0b1420; color:#fff; margin:0 0 10px"/>
      <button id="nickSubmit" class="btn-submit">설정</button>
    </div>`;
    document.body.appendChild(wrap);
}
function openNickModal() {
    ensureNicknameModal();
    $("#nickModal").style.display = "grid";
    $("#nickInput").value = "";
    $("#nickInput").focus();
}
function closeNickModal() {
    const m = $("#nickModal");
    if (m) m.style.display = "none";
}
function validNickname(s) {
    const v = String(s || "").trim();
    if (v.length < 3 || v.length > 16) return { ok: false, msg: "닉네임은 3~16자로 입력하세요." };
    if (!/^[0-9A-Za-z가-힣_]+$/.test(v)) return { ok: false, msg: "영문/숫자/한글/언더스코어만 가능." };
    if (containsProfanity(v)) return { ok: false, msg: "비속어는 사용할 수 없습니다." };
    return { ok: true, v };
}
async function handleNicknameSubmit() {
    const input = $("#nickInput");
    if (!input) return;
    const chk = validNickname(input.value);
    if (!chk.ok) return toast(chk.msg, false);
    const v = chk.v,
        vLower = v.toLowerCase();
    const user = auth.currentUser;
    if (!user) return toast("로그인이 필요합니다.", false);
    const profRef = doc(db, "profiles", user.uid);
    const nickRef = doc(db, "nicknames", vLower);
    try {
        await runTransaction(db, async (tx) => {
            const nickDoc = await tx.get(nickRef);
            if (nickDoc.exists()) throw new Error("이미 사용 중인 닉네임입니다.");
            tx.set(profRef, { nickname: v, nicknameLower: vLower, updatedAt: serverTimestamp() }, { merge: true });
            tx.set(nickRef, { uid: user.uid, createdAt: serverTimestamp() });
        });
        myNickname = v;
        myNicknameLower = vLower;
        toast("닉네임이 설정되었습니다.");
        closeNickModal();
    } catch (e) {
        toast("닉네임 설정 실패: " + (e?.message || String(e)), false);
    }
}
document.addEventListener("click", (e) => {
    if (e.target?.id === "nickSubmit") handleNicknameSubmit();
});

/* ---------------- Lookup functions (트롤 조회) ---------------- */
async function runLookup(reset = false) {
    if (!resultBox) return;
    if (reset) {
        resultBox.innerHTML = '<div class="result-meta">불러오는 중...</div>';
        lookupCursor = null;
    }
    const kw = (lookupKeyword || "").toLowerCase().trim();

    let snap, items;
    try {
        if (kw) {
            const riotKw = kw.includes("#") ? kw : kw + "#";
            const qref = query(
                collection(db, "reports"),
                where("status", "==", "approved"),
                orderBy("riotIdNorm"),
                startAt(riotKw),
                endAt(riotKw + "\uf8ff"),
                ...(lookupCursor ? [startAfter(lookupCursor)] : []),
                limit(20)
            );
            snap = await getDocs(qref);
            items = snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter(
                    (x) =>
                        (x.description || "").toLowerCase().includes(kw) || (x.riotId || "").toLowerCase().includes(kw)
                );
        } else {
            const qref = query(
                collection(db, "reports"),
                where("status", "==", "approved"),
                orderBy("createdAt", "desc"),
                ...(lookupCursor ? [startAfter(lookupCursor)] : []),
                limit(20)
            );
            snap = await getDocs(qref);
            items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
    } catch {
        const qref = query(
            collection(db, "reports"),
            where("status", "==", "approved"),
            orderBy("createdAt", "desc"),
            ...(lookupCursor ? [startAfter(lookupCursor)] : []),
            limit(20)
        );
        snap = await getDocs(qref);
        items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (kw)
            items = items.filter(
                (x) => (x.description || "").toLowerCase().includes(kw) || (x.riotId || "").toLowerCase().includes(kw)
            );
    }

    lookupCursor = snap.docs[snap.docs.length - 1] || null;
    moreBtn?.classList.toggle("hidden", snap.empty || !lookupCursor);
    renderResults(items, reset);
}
function wireLookupUI() {
    if (qInput) {
        const onType = debounce(() => {
            lookupKeyword = qInput.value.trim();
            runLookup(true).catch((e) => toast("검색 실패: " + e.message, false));
        }, 250);
        qInput.addEventListener("input", onType);
    }
    moreBtn?.addEventListener("click", () => {
        runLookup(false).catch((e) => toast("더 보기 실패: " + e.message, false));
    });
}
async function firstLoadLookup() {
    lookupKeyword = "";
    await runLookup(true);
}

/* ---------------- 댓글 공통 UI ---------------- */
function commentPanelTemplate(targetId) {
    return `
    <div class="comment-panel" data-target="${targetId}" style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06)">
      <div class="comment-list" id="cList-${targetId}" style="display:grid; gap:8px;"></div>
      <div class="comment-form" style="margin-top:8px; display:flex; gap:8px; align-items:flex-start;">
        <textarea id="cInput-${targetId}" rows="2" placeholder="댓글을 입력하세요 (최대 500자)"
                  class="comment-editbox" style="min-height:64px"></textarea>
        <button class="btn-submit btn-ghost btn-sm" id="cSubmit-${targetId}" style="width:auto; white-space:nowrap;">댓글 등록</button>
      </div>
    </div>
  `;
}
function renderCommentItem(c) {
    const dateStr = c.createdAt?.toDate?.() ? c.createdAt.toDate().toLocaleString() : "";
    const edited = c.updatedAt?.toDate?.() ? '<span class="comment-meta-edited">(수정됨)</span>' : "";
    const canEdit = auth.currentUser && auth.currentUser.uid === c.userId;

    const controls = canEdit
        ? `
    <button class="btn-submit btn-ghost btn-sm" data-act="c-edit" data-id="${c.id}">수정</button>
    <button class="btn-submit btn-danger btn-sm" data-act="c-del" data-id="${c.id}">삭제</button>
  `
        : "";

    return `
    <div class="comment-item" data-id="${c.id}"
         style="background:#111a27; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 10px;">
      <!-- 상단: 작성자 -->
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <div style="font-weight:800; color:#cfe4ff">${escapeHtml(c.nickname || "익명")}</div>
      </div>

      <!-- 본문 -->
      <div class="comment-text" style="color:#d6dfeb; font-size:13px; margin-top:6px;">${escapeHtml(c.text || "")}</div>

      <!-- 날짜/시간 (본문 '아래') -->
      <div class="comment-meta-time">${dateStr}${edited}</div>

      <!-- 버튼들 (날짜/시간 '아래' 줄) -->
      <div class="comment-actions">${controls}</div>
    </div>
  `;
}

/* ------- Reports 댓글: hasRecent + attach ------- */
async function hasRecentComment(reportId, uid, seconds = 5) {
    try {
        const snap = await getDocs(
            query(
                collection(db, "reports", reportId, "comments"),
                where("userId", "==", uid),
                orderBy("createdAt", "desc"),
                limit(1)
            )
        );
        if (snap.empty) return false;
        const last = snap.docs[0].data().createdAt?.toDate?.() || new Date(0);
        return (Date.now() - last.getTime()) / 1000 < seconds;
    } catch {
        return false;
    }
}
function attachComments(reportId, hostEl, badgeEl) {
    if (commentUnsubs.has(reportId)) {
        try {
            commentUnsubs.get(reportId)();
        } catch {}
        commentUnsubs.delete(reportId);
    }
    const listEl = hostEl.querySelector(`#cList-${cssEscape(reportId)}`);
    const btnEl = hostEl.querySelector(`#cSubmit-${cssEscape(reportId)}`);
    const inputEl = hostEl.querySelector(`#cInput-${cssEscape(reportId)}`);
    if (!listEl || !btnEl || !inputEl) return;

    const qref = query(collection(db, "reports", reportId, "comments"), orderBy("createdAt", "asc"), limit(100));
    const unsub = onSnapshot(qref, (snap) => {
        listEl.innerHTML = "";
        let count = 0;
        snap.forEach((d) => {
            const x = { id: d.id, ...d.data() };
            listEl.insertAdjacentHTML("beforeend", renderCommentItem(x));
            count++;
        });
        if (badgeEl) badgeEl.textContent = `댓글 ${count}`;
    });
    commentUnsubs.set(reportId, unsub);

    btnEl.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return toast("로그인이 필요합니다.", false);
        if (!myNickname) {
            openNickModal();
            return;
        }
        const text = String(inputEl.value || "").trim();
        if (!text) return toast("내용을 입력하세요.", false);
        if (text.length > 500) return toast("500자 이하로 입력하세요.", false);
        if (containsProfanity(text)) return toast("비속어가 포함되어 있습니다.", false);
        if (await hasRecentComment(reportId, user.uid)) return toast("잠시 후 다시 시도하세요.", false);
        try {
            await addDoc(collection(db, "reports", reportId, "comments"), {
                text,
                userId: user.uid,
                nickname: myNickname,
                createdAt: serverTimestamp()
            });
            inputEl.value = "";
        } catch (e) {
            toast("댓글 등록 실패: " + (e?.message || e), false);
        }
    };

    // 수정/삭제 위임
    listEl.onclick = async (e) => {
        const target = e.target;

        const delBtn = target.closest('button[data-act="c-del"]');
        if (delBtn) {
            const id = delBtn.dataset.id;
            if (!auth.currentUser) return toast("로그인이 필요합니다.", false);
            try {
                await deleteDoc(doc(db, "reports", reportId, "comments", id));
            } catch (err) {
                toast("삭제 실패: " + (err?.message || err), false);
            }
            return;
        }

        const editBtn = target.closest('button[data-act="c-edit"]');
        if (editBtn) {
            const id = editBtn.dataset.id;
            const itemEl = editBtn.closest(".comment-item");
            const textEl = itemEl?.querySelector(".comment-text");
            if (!itemEl || !textEl) return;
            const oldText = textEl.textContent;
            textEl.style.display = "none";
            const box = document.createElement("textarea");
            box.className = "comment-editbox";
            box.value = oldText;
            textEl.insertAdjacentElement("afterend", box);
            itemEl.querySelector(".comment-actions").innerHTML = `
        <button class="btn-submit btn-outline btn-sm" data-act="c-cancel" data-id="${id}">취소</button>
        <button class="btn-submit btn-sm" data-act="c-save" data-id="${id}">저장</button>`;
            return;
        }

        const cancelBtn = target.closest('button[data-act="c-cancel"]');
        if (cancelBtn) {
            const itemEl = cancelBtn.closest(".comment-item");
            const box = itemEl?.querySelector(".comment-editbox");
            const textEl = itemEl?.querySelector(".comment-text");
            if (box && textEl) {
                box.remove();
                textEl.style.display = "";
            }
            const id = cancelBtn.dataset.id;
            itemEl.querySelector(".comment-actions").innerHTML = `
        <button class="btn-submit btn-ghost btn-sm" data-act="c-edit" data-id="${id}">수정</button>
        <button class="btn-submit btn-danger btn-sm" data-act="c-del" data-id="${id}">삭제</button>`;
            return;
        }

        const saveBtn = target.closest('button[data-act="c-save"]');
        if (saveBtn) {
            const id = saveBtn.dataset.id;
            if (!auth.currentUser) return toast("로그인이 필요합니다.", false);
            const itemEl = saveBtn.closest(".comment-item");
            const box = itemEl?.querySelector(".comment-editbox");
            if (!box) return;
            const newText = String(box.value || "").trim();
            if (!newText) return toast("내용을 입력하세요.", false);
            if (newText.length > 500) return toast("500자 이하로 입력하세요.", false);
            if (containsProfanity(newText)) return toast("비속어가 포함되어 있습니다.", false);
            try {
                await updateDoc(doc(db, "reports", reportId, "comments", id), {
                    text: newText,
                    updatedAt: serverTimestamp()
                });
                const textEl = itemEl.querySelector(".comment-text");
                if (textEl) {
                    textEl.textContent = newText;
                    textEl.style.display = "";
                }
                box.remove();
                itemEl.querySelector(".comment-actions").innerHTML = `
          <button class="btn-submit btn-ghost btn-sm" data-act="c-edit" data-id="${id}">수정</button>
          <button class="btn-submit btn-danger btn-sm" data-act="c-del" data-id="${id}">삭제</button>`;
                toast("수정 완료");
            } catch (err) {
                toast("수정 실패: " + (err?.message || err), false);
            }
            return;
        }
    };
}

/* ---------------- Results renderer (신고 + 댓글) ---------------- */
function renderResults(items, initial) {
    if (!resultBox) return;
    if (initial) resultBox.innerHTML = "";
    if (items.length === 0 && initial) {
        resultBox.innerHTML = '<div class="result-meta">결과가 없습니다.</div>';
        return;
    }

    items.forEach((d) => {
        const el = document.createElement("div");
        el.className = "result-card";
        const dateStr = d.createdAt?.toDate?.() ? d.createdAt.toDate().toLocaleString() : "";

        el.innerHTML = `
      <div class="result-top">
        <div class="result-name">${escapeHtml(d.riotId || "-")}</div>
        <div class="result-cat">${escapeHtml(d.category || "기타")}</div>
      </div>

      ${d.createdByNick ? `<div class="result-sub">작성자: ${escapeHtml(d.createdByNick)}</div>` : ""}

      <div class="result-desc report-desc">${escapeHtml(d.description || "")}</div>

      <div class="result-meta">
        ${dateStr}
        ${d.proof ? ` · <a class="result-proof" href="${escapeAttr(d.proof)}" target="_blank" rel="noopener">증거</a>` : ""}
      </div>

      <div class="btn-row">
        ${isAdmin ? `<button class="btn-submit btn-danger btn-sm btn-inline" data-act="delete-approved" data-id="${d.id}">삭제</button>` : ""}
        <button class="btn-submit btn-outline btn-sm btn-inline" data-act="toggle-comments" data-id="${d.id}" id="cBadge-${d.id}">
          댓글 열기
        </button>
      </div>

      <div class="comment-host" id="cHost-${d.id}" style="display:none;">
        ${commentPanelTemplate(d.id)}
      </div>
    `;
        resultBox.appendChild(el);
    });
}

/* 삭제 / 댓글 토글 위임 (신고 카드) */
if (resultBox) {
    resultBox.addEventListener("click", async (e) => {
        const delBtn = e.target.closest('button[data-act="delete-approved"]');
        if (delBtn) {
            if (!isAdmin) return toast("관리자만 가능합니다.", false);
            const id = delBtn.dataset.id;
            if (!confirm("이 승인된 신고를 삭제할까요? 되돌릴 수 없습니다.")) return;
            const card = delBtn.closest(".result-card");
            if (card) card.remove();
            try {
                await deleteDoc(doc(db, "reports", id));
                toast("삭제 완료");
            } catch (err) {
                toast("삭제 실패: " + err.message, false);
            } finally {
                if (!resultBox.querySelector(".result-card"))
                    resultBox.innerHTML = '<div class="result-meta">결과가 없습니다.</div>';
            }
            return;
        }

        const cBtn = e.target.closest('button[data-act="toggle-comments"]');
        if (cBtn) {
            const id = cBtn.dataset.id;
            const host = document.getElementById(`cHost-${id}`);
            if (!host) return;
            const opened = host.style.display !== "none";
            if (opened) {
                host.style.display = "none";
                cBtn.textContent = "댓글 열기";
                if (commentUnsubs.has(id)) {
                    try {
                        commentUnsubs.get(id)();
                    } catch {}
                    commentUnsubs.delete(id);
                }
            } else {
                host.style.display = "";
                cBtn.textContent = "댓글 0";
                attachComments(id, host, cBtn);
            }
        }
    });
}

/* ---------------- Admin/Notifications (원본 유지) ---------------- */
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
                updateDoc(doc(db, "notifications", c.doc.id), { read: true }).catch(() => {});
            }
        });
    });
}
function stopNotificationWatch() {
    if (unsubscribeNoti) {
        unsubscribeNoti();
        unsubscribeNoti = null;
    }
}
function toggleAdminTab(on) {
    const nav = document.querySelector('.nav-link[data-page="admin"]')?.parentElement;
    if (!nav) return;
    nav.style.display = on ? "" : "none";
    updateAdminBadgeCount();
}
function updateAdminBadgeCount() {
    const badge = $("#adminBadge");
    if (!badge) return;
    const pending = lastPendingSnap?.size || 0;
    const appeals = lastAppealSnap?.size || 0;
    const total = pending + appeals;
    badge.textContent = String(total);
    badge.classList.toggle("hidden", total === 0);
}

/* ---------------- Reports submit (닉네임 포함) ---------------- */
$("#btnReport")?.addEventListener("click", async () => {
    const btn = $("#btnReport");
    const riotId = $("#rRiotId").value.trim();
    const category = $("#rCategory").value.trim();
    const desc = $("#rDesc").value.trim();
    const proof = $("#rProof").value.trim();
    if (!riotId || !riotId.includes("#")) return toast("라이엇 ID는 '닉네임#태그' 형식입니다.", false);
    if (!category) return toast("카테고리를 선택하세요.", false);
    if (!desc || desc.length < 10) return toast("설명을 10자 이상 입력하세요.", false);
    if (!proof || !isValidHttpUrl(proof)) return toast("유효한 증거 링크(URL)를 입력하세요.", false);
    if (containsProfanity(desc)) return toast("설명에 비속어가 포함되어 있습니다.", false);

    try {
        const riotIdNorm = normRiotId(riotId);
        if (auth.currentUser) {
            if (!myNickname) {
                openNickModal();
                return;
            }
            if (await hasRecentSame(auth.currentUser.uid, riotIdNorm))
                return toast("같은 대상에 대한 최근 신고가 있어요.", false);
        }
        btn.disabled = true;
        await addDoc(collection(db, "reports"), {
            riotId,
            riotIdNorm,
            category,
            description: desc,
            proof,
            status: "pending",
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser ? auth.currentUser.uid : null,
            createdByNick: myNickname || null
        });
        toast("신고가 접수되었습니다. 검토 후 알림으로 알려드릴게요.");
        $("#rRiotId").value = "";
        $("#rCategory").value = "";
        $("#rDesc").value = "";
        $("#rProof").value = "";
        refreshStats().catch(() => {});
    } catch (e) {
        toast("등록 실패: " + e.message, false);
    } finally {
        btn.disabled = false;
    }
});
async function hasRecentSame(uid, riotIdNorm, minutes = 60 * 24) {
    try {
        const s = await getDocs(
            query(
                collection(db, "reports"),
                where("createdBy", "==", uid),
                where("riotIdNorm", "==", riotIdNorm),
                orderBy("createdAt", "desc"),
                limit(1)
            )
        );
        if (s.empty) return false;
        const lastAt = s.docs[0].data().createdAt?.toDate?.() || new Date(0);
        return (Date.now() - lastAt.getTime()) / 60000 < minutes;
    } catch {
        return false;
    }
}

/* ---------------- Appeals submit (닉 포함) ---------------- */
$("#btnAppeal")?.addEventListener("click", async () => {
    const btn = $("#btnAppeal");
    const riotId = $("#aRiotId").value.trim();
    const reason = $("#aReason").value.trim();
    const proof = $("#aProof").value.trim();
    if (!riotId || !riotId.includes("#")) return toast("라이엇 ID는 '닉네임#태그' 형식입니다.", false);
    if (!reason || reason.length < 10) return toast("사유를 10자 이상 입력하세요.", false);
    if (!proof || !isValidHttpUrl(proof)) return toast("유효한 추가 증거 링크를 입력하세요.", false);
    if (containsProfanity(reason)) return toast("사유에 비속어가 포함되어 있습니다.", false);

    try {
        if (auth.currentUser && !myNickname) {
            openNickModal();
            return;
        }
        btn.disabled = true;
        await addDoc(collection(db, "appeals"), {
            riotId,
            reason,
            proof,
            status: "submitted",
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser ? auth.currentUser.uid : null,
            createdByNick: myNickname || null
        });
        toast("이의가 접수되었습니다. 결과는 알림으로 알려드릴게요.");
        $("#aRiotId").value = "";
        $("#aReason").value = "";
        $("#aProof").value = "";
    } catch (e) {
        toast("제출 실패: " + e.message, false);
    } finally {
        btn.disabled = false;
    }
});

/* ---------------- Stats ---------------- */
async function refreshStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);

    const snap = await getDocs(
        query(collection(db, "reports"), where("status", "==", "approved"), orderBy("createdAt", "desc"), limit(300))
    );
    let today = 0,
        week = 0;
    snap.forEach((d) => {
        const t = d.data().createdAt?.toDate?.() || new Date(0);
        if (t >= todayStart) today++;
        if (t >= weekAgo) week++;
    });

    try {
        const qTotal = query(collection(db, "reports"), where("status", "==", "approved"));
        const c = await getCountFromServer(qTotal);
        $("#totalCount").textContent = c.data().count;
    } catch {
        $("#totalCount").textContent = snap.size;
    }
    $("#todayCount").textContent = today;
    $("#weekCount").textContent = week;
}

/* ---------------- Admin: Pending ---------------- */
async function loadPending() {
    try {
        const snap = await getDocs(
            query(collection(db, "reports"), where("status", "==", "pending"), orderBy("createdAt", "asc"), limit(50))
        );
        lastPendingSnap = snap;
        renderPendingFromSnapshot(snap);
        updateAdminBadgeCount();
    } catch (err) {
        const box = $("#pendingList");
        if (box) box.innerHTML = `<div class="result-meta">에러: ${escapeHtml(err.message || String(err))}</div>`;
    }
}
function renderPendingFromSnapshot(snap) {
    const box = $("#pendingList");
    if (!box) return;
    box.innerHTML = "";
    if (snap.empty) {
        box.innerHTML = '<div class="result-meta">승인 대기 문서가 없습니다.</div>';
        return;
    }
    snap.forEach((d) => {
        const x = d.data();
        const dateStr = x.createdAt?.toDate?.() ? x.createdAt.toDate().toLocaleString() : "";
        const el = document.createElement("div");
        el.className = "result-card";
        el.innerHTML = `
      <div class="result-top">
        <div class="result-name">${escapeHtml(x.riotId || "-")}</div>
        <div class="result-cat">대기</div>
      </div>
      <div class="result-desc report-description">${escapeHtml(x.description || "")}</div>
      <div class="result-meta">${dateStr}
        ${x.proof ? ` · <a class="result-proof" href="${escapeAttr(x.proof)}" target="_blank" rel="noopener">증거</a>` : ""}
        ${x.createdByNick ? ` · 작성자: ${escapeHtml(x.createdByNick)}` : ""}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-submit" data-act="approve" data-id="${d.id}">승인</button>
        <button class="btn-submit" style="background:#354455" data-act="reject" data-id="${d.id}">반려</button>
      </div>`;
        box.appendChild(el);
    });

    box.onclick = async (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        if (!isAdmin) return toast("관리자만 가능합니다.", false);

        const id = btn.dataset.id;
        const act = btn.dataset.act;
        const card = btn.closest(".result-card");
        if (card) card.remove();
        try {
            const ref = doc(db, "reports", id);
            const cur = await getDoc(ref);
            const data = cur.exists() ? cur.data() : null;
            if (!data) throw new Error("문서를 찾을 수 없습니다.");

            if (act === "approve") {
                await updateDoc(ref, { status: "approved", approvedAt: serverTimestamp() });
                if (data.createdBy)
                    await addDoc(collection(db, "notifications"), {
                        userId: data.createdBy,
                        type: "report-approved",
                        message: `[승인됨] ${data.riotId} 신고가 승인되었습니다.`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
            } else if (act === "reject") {
                const reason = prompt("반려 사유를 입력하세요.");
                if (!reason) {
                    loadPending();
                    return;
                }
                await updateDoc(ref, { status: "rejected", rejectedAt: serverTimestamp(), rejectReason: reason });
                if (data.createdBy)
                    await addDoc(collection(db, "notifications"), {
                        userId: data.createdBy,
                        type: "report-rejected",
                        message: `[반려됨] ${data.riotId} 신고가 반려되었습니다. 사유: ${reason}`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
            }

            loadAdminCountsOnce().catch(() => updateAdminBadgeCount());
            if (!box.querySelector(".result-card"))
                box.innerHTML = '<div class="result-meta">승인 대기 문서가 없습니다.</div>';
        } catch (err) {
            toast("처리 실패: " + (err.message || err), false);
        }
    };
}

/* ---------------- Admin: realtime watchers ---------------- */
function startPendingWatch() {
    if (unsubscribePending) return;
    const q = query(collection(db, "reports"), where("status", "==", "pending"), orderBy("createdAt", "asc"));
    unsubscribePending = onSnapshot(q, (snap) => {
        lastPendingSnap = snap;
        const opened = $("#page-admin")?.classList.contains("page-active");
        if (opened) renderPendingFromSnapshot(snap);
        updateAdminBadgeCount();
    });
}
function stopPendingWatch() {
    if (unsubscribePending) {
        unsubscribePending();
        unsubscribePending = null;
    }
}

function startAppealWatch() {
    if (unsubscribeAppeals) return;
    const q = query(collection(db, "appeals"), where("status", "==", "submitted"), orderBy("createdAt", "asc"));
    unsubscribeAppeals = onSnapshot(q, (snap) => {
        lastAppealSnap = snap;
        const opened = $("#page-admin")?.classList.contains("page-active");
        if (opened) renderAppealsFromSnapshot(snap);
        updateAdminBadgeCount();
    });
}
function stopAppealWatch() {
    if (unsubscribeAppeals) {
        unsubscribeAppeals();
        unsubscribeAppeals = null;
    }
}

function renderAppealsFromSnapshot(snap) {
    const box = $("#appealList");
    if (!box) return;
    box.innerHTML = "";
    if (snap.empty) {
        box.innerHTML = '<div class="result-meta">이의 신청이 없습니다.</div>';
        return;
    }
    snap.forEach((d) => {
        const x = d.data();
        const dateStr = x.createdAt?.toDate?.() ? x.createdAt.toDate().toLocaleString() : "";
        const el = document.createElement("div");
        el.className = "result-card";
        el.innerHTML = `
      <div class="result-top">
        <div class="result-name">${escapeHtml(x.riotId || "-")}</div>
        <div class="result-cat">이의</div>
      </div>
      <div class="result-desc appeal-description">${escapeHtml(x.reason || "")}</div>
      <div class="result-meta">${dateStr}
        ${x.proof ? ` · <a class="result-proof" href="${escapeAttr(x.proof)}" target="_blank" rel="noopener">증거</a>` : ""}
        ${x.createdByNick ? ` · 작성자: ${escapeHtml(x.createdByNick)}` : ""}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-submit" data-act="appeal-accept" data-id="${d.id}">이의 수용</button>
        <button class="btn-submit" style="background:#354455" data-act="appeal-reject" data-id="${d.id}">반려</button>
      </div>`;
        box.appendChild(el);
    });

    box.onclick = async (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        if (!isAdmin) return toast("관리자만 가능합니다.", false);

        const id = btn.dataset.id;
        const act = btn.dataset.act;
        const card = btn.closest(".result-card");
        if (card) card.remove();
        try {
            const ref = doc(db, "appeals", id);
            const cur = await getDoc(ref);
            const data = cur.exists() ? cur.data() : null;
            if (!data) throw new Error("문서를 찾을 수 없습니다.");

            if (act === "appeal-accept") {
                await updateDoc(ref, { status: "accepted", processedAt: serverTimestamp() });
                if (data.createdBy)
                    await addDoc(collection(db, "notifications"), {
                        userId: data.createdBy,
                        type: "appeal-accepted",
                        message: `[이의 수용] ${data.riotId} 건 이의가 수용되었습니다.`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
            } else if (act === "appeal-reject") {
                const reason = prompt("이의 반려 사유를 입력하세요.");
                if (!reason) {
                    renderAppealsFromSnapshot(lastAppealSnap || { empty: true, forEach: () => {} });
                    updateAdminBadgeCount();
                    return;
                }
                await updateDoc(ref, { status: "rejected", processedAt: serverTimestamp(), rejectReason: reason });
                if (data.createdBy)
                    await addDoc(collection(db, "notifications"), {
                        userId: data.createdBy,
                        type: "appeal-rejected",
                        message: `[이의 반려] ${data.riotId} 건 이의가 반려되었습니다. 사유: ${reason}`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
            }

            loadAdminCountsOnce().catch(() => updateAdminBadgeCount());
            if (!box.querySelector(".result-card"))
                box.innerHTML = '<div class="result-meta">이의 신청이 없습니다.</div>';
        } catch (err) {
            toast("처리 실패: " + (err.message || err), false);
        }
    };
}

/* ---------------- Admin counts (used by badge) ---------------- */
async function loadAdminCountsOnce() {
    try {
        const [p, a] = await Promise.all([
            getDocs(query(collection(db, "reports"), where("status", "==", "pending"))),
            getDocs(query(collection(db, "appeals"), where("status", "==", "submitted")))
        ]);
        lastPendingSnap = p;
        lastAppealSnap = a;
        updateAdminBadgeCount();
    } catch {
        /* no-op */
    }
}

/* ---------------- Routines: submit/list/comments (닉 포함) ---------------- */
rForm.submit?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return toast("로그인이 필요합니다.", false);
    if (!myNickname) {
        openNickModal();
        return;
    }

    const tier = rForm.tier?.value?.trim();
    const platform = rForm.platform?.value?.trim();
    const title = rForm.title?.value?.trim();
    const playlist = rForm.playlist?.value?.trim();
    const desc = rForm.desc?.value?.trim();

    if (!tier) return toast("티어를 선택하세요.", false);
    if (!platform) return toast("플랫폼을 선택하세요.", false);
    if (!title || title.length < 3) return toast("루틴 제목을 3자 이상 입력하세요.", false);
    if (!playlist || !isValidHttpUrl(playlist)) return toast("유효한 플레이리스트 링크를 입력하세요.", false);
    if (!desc || desc.length < 10) return toast("설명을 10자 이상 입력하세요.", false);
    if (containsProfanity(title) || containsProfanity(desc)) return toast("비속어가 포함되어 있습니다.", false);

    try {
        rForm.submit.disabled = true;
        await addDoc(collection(db, "routines"), {
            tier,
            platform,
            title,
            playlist,
            desc,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            createdByNick: myNickname
        });
        toast("루틴이 등록되었습니다.");
        rForm.tier.value = "";
        rForm.platform.value = "";
        rForm.title.value = "";
        rForm.playlist.value = "";
        rForm.desc.value = "";
        firstLoadRoutines?.();
    } catch (e) {
        toast("등록 실패: " + (e?.message || e), false);
    } finally {
        rForm.submit.disabled = false;
    }
});

function renderRoutineItem(xRaw) {
    const x = typeof normalizeRoutine === "function" ? normalizeRoutine(xRaw) : xRaw;
    const when = x.createdAt?.toDate?.() ? x.createdAt.toDate().toLocaleString() : "";
    const safe = (s) => escapeHtml(s || "");
    const canDelete = !!(isAdmin || (auth.currentUser && auth.currentUser.uid === x.createdBy));

    // 서브라인(작성자 · 티어) 만들기
    const subParts = [];
    if (x.createdByNick || x.createdByName) subParts.push(`작성자: ${safe(x.createdByNick || x.createdByName)}`);
    if (x.tier) subParts.push(`티어: ${safe(x.tier)}`);
    const subLine = subParts.length ? `<div class="result-sub">${subParts.join(" · ")}</div>` : "";

    return `
    <div class="result-card" data-routine="${x.id}">
      <div class="result-top">
        <div class="result-name">${safe(x.title)}</div>
        <div class="result-cat">${safe(x.platform || "-")}</div>
      </div>

      ${subLine}

      <div class="result-desc routine-desc">${safe(x.desc || x.description || "")}</div>

      <div class="result-meta">
        ${when}
        ${x.playlist || x.playlistUrl ? ` · <a class="result-proof" href="${escapeAttr(x.playlist || x.playlistUrl)}" target="_blank" rel="noopener">플레이리스트</a>` : ""}
      </div>

      <div class="btn-row">
        ${canDelete ? `<button class="btn-submit btn-danger btn-sm btn-inline" data-act="rt-del" data-id="${x.id}">삭제</button>` : ""}
        <button class="btn-submit btn-outline btn-sm btn-inline"
                data-act="rt-toggle-comments" data-id="${x.id}" id="rtCBadge-${x.id}">
          댓글 열기
        </button>
      </div>

      <div class="comment-host" id="rtCHost-${x.id}" style="display:none;">
        ${commentPanelTemplate(x.id)}
      </div>
    </div>
  `;
}

async function loadRoutines(reset = false) {
    if (!rListBox) return;
    if (reset) {
        rListBox.innerHTML = '<div class="result-meta">불러오는 중...</div>';
        routineCursor = null;
    }

    let snap;
    try {
        snap = await getDocs(
            query(
                collection(db, "routines"),
                orderBy("createdAt", "desc"),
                ...(routineCursor ? [startAfter(routineCursor)] : []),
                limit(20)
            )
        );
    } catch (e) {
        return toast("루틴 불러오기 실패: " + (e?.message || e), false);
    }

    routineCursor = snap.docs[snap.docs.length - 1] || null;
    rMoreBtn?.classList.toggle("hidden", snap.empty || !routineCursor);

    let items = snap.docs.map((d) => normalizeRoutine({ id: d.id, ref: d.ref, ...d.data() }));

    const kw = (routineKw || "").toLowerCase().trim();
    if (kw) {
        items = items.filter(
            (x) =>
                (x.title || "").toLowerCase().includes(kw) ||
                (x.desc || "").toLowerCase().includes(kw) ||
                (x.createdByNick || "").toLowerCase().includes(kw)
        );
    }

    if (reset) rListBox.innerHTML = "";
    if (items.length === 0 && reset) {
        rListBox.innerHTML = '<div class="result-meta">공유된 루틴이 없습니다.</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((x) => {
        const div = document.createElement("div");
        div.innerHTML = renderRoutineItem(x);
        frag.appendChild(div.firstElementChild);
    });
    rListBox.appendChild(frag);
}

function attachRoutineComments(routineId, hostEl, badgeEl) {
    if (routineCommentUnsubs.has(routineId)) {
        try {
            routineCommentUnsubs.get(routineId)();
        } catch {}
        routineCommentUnsubs.delete(routineId);
    }
    const listEl = hostEl.querySelector(`#cList-${cssEscape(routineId)}`);
    const btnEl = hostEl.querySelector(`#cSubmit-${cssEscape(routineId)}`);
    const inputEl = hostEl.querySelector(`#cInput-${cssEscape(routineId)}`);
    if (!listEl || !btnEl || !inputEl) return;

    const qref = query(collection(db, "routines", routineId, "comments"), orderBy("createdAt", "asc"), limit(100));
    const unsub = onSnapshot(qref, (snap) => {
        listEl.innerHTML = "";
        let count = 0;
        snap.forEach((d) => {
            const x = { id: d.id, ...d.data() };
            listEl.insertAdjacentHTML("beforeend", renderCommentItem(x));
            count++;
        });
        if (badgeEl) badgeEl.textContent = `댓글 ${count}`;
    });
    routineCommentUnsubs.set(routineId, unsub);

    btnEl.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return toast("로그인이 필요합니다.", false);
        if (!myNickname) {
            openNickModal();
            return;
        }
        const text = String(inputEl.value || "").trim();
        if (!text) return toast("내용을 입력하세요.", false);
        if (text.length > 500) return toast("500자 이하로 입력하세요.", false);
        if (containsProfanity(text)) return toast("비속어가 포함되어 있습니다.", false);
        try {
            await addDoc(collection(db, "routines", routineId, "comments"), {
                text,
                userId: user.uid,
                nickname: myNickname,
                createdAt: serverTimestamp()
            });
            inputEl.value = "";
        } catch (e) {
            toast("댓글 등록 실패: " + (e?.message || e), false);
        }
    };

    // 수정/삭제 위임(보고서와 동일)
    listEl.onclick = async (e) => {
        const target = e.target;

        const delBtn = target.closest('button[data-act="c-del"]');
        if (delBtn) {
            const id = delBtn.dataset.id;
            if (!auth.currentUser) return toast("로그인이 필요합니다.", false);
            try {
                await deleteDoc(doc(db, "routines", routineId, "comments", id));
            } catch (err) {
                toast("삭제 실패: " + (err?.message || err), false);
            }
            return;
        }

        const editBtn = target.closest('button[data-act="c-edit"]');
        if (editBtn) {
            const id = editBtn.dataset.id;
            const itemEl = editBtn.closest(".comment-item");
            const textEl = itemEl?.querySelector(".comment-text");
            if (!itemEl || !textEl) return;
            const oldText = textEl.textContent;
            textEl.style.display = "none";
            const box = document.createElement("textarea");
            box.className = "comment-editbox";
            box.value = oldText;
            textEl.insertAdjacentElement("afterend", box);
            itemEl.querySelector(".comment-actions").innerHTML = `
        <button class="btn-submit btn-outline btn-sm" data-act="c-cancel" data-id="${id}">취소</button>
        <button class="btn-submit btn-sm" data-act="c-save" data-id="${id}">저장</button>`;
            return;
        }

        const cancelBtn = target.closest('button[data-act="c-cancel"]');
        if (cancelBtn) {
            const itemEl = cancelBtn.closest(".comment-item");
            const box = itemEl?.querySelector(".comment-editbox");
            const textEl = itemEl?.querySelector(".comment-text");
            if (box && textEl) {
                box.remove();
                textEl.style.display = "";
            }
            const id = cancelBtn.dataset.id;
            itemEl.querySelector(".comment-actions").innerHTML = `
        <button class="btn-submit btn-ghost btn-sm" data-act="c-edit" data-id="${id}">수정</button>
        <button class="btn-submit btn-danger btn-sm" data-act="c-del" data-id="${id}">삭제</button>`;
            return;
        }

        const saveBtn = target.closest('button[data-act="c-save"]');
        if (saveBtn) {
            const id = saveBtn.dataset.id;
            if (!auth.currentUser) return toast("로그인이 필요합니다.", false);
            const itemEl = saveBtn.closest(".comment-item");
            const box = itemEl?.querySelector(".comment-editbox");
            if (!box) return;
            const newText = String(box.value || "").trim();
            if (!newText) return toast("내용을 입력하세요.", false);
            if (newText.length > 500) return toast("500자 이하로 입력하세요.", false);
            if (containsProfanity(newText)) return toast("비속어가 포함되어 있습니다.", false);
            try {
                await updateDoc(doc(db, "routines", routineId, "comments", id), {
                    text: newText,
                    updatedAt: serverTimestamp()
                });
                const textEl = itemEl.querySelector(".comment-text");
                if (textEl) {
                    textEl.textContent = newText;
                    textEl.style.display = "";
                }
                box.remove();
                itemEl.querySelector(".comment-actions").innerHTML = `
          <button class="btn-submit btn-ghost btn-sm" data-act="c-edit" data-id="${id}">수정</button>
          <button class="btn-submit btn-danger btn-sm" data-act="c-del" data-id="${id}">삭제</button>`;
                toast("수정 완료");
            } catch (err) {
                toast("수정 실패: " + (err?.message || err), false);
            }
            return;
        }
    };
}

function wireRoutineUI() {
    if (routineHandlersBound) return; // ✅ 이미 연결돼 있으면 재연결 금지
    routineHandlersBound = true;

    if (rQueryInput && !rQueryInput.dataset.wired) {
        const onType = debounce(() => {
            routineKw = rQueryInput.value.trim();
            loadRoutines(true).catch((e) => toast("검색 실패: " + (e?.message || e), false));
        }, 250);
        rQueryInput.addEventListener("input", onType);
        rQueryInput.dataset.wired = "1"; // ✅ 중복 방지
    }

    if (rMoreBtn && !rMoreBtn.dataset.wired) {
        rMoreBtn.addEventListener("click", () => {
            loadRoutines(false).catch((e) => toast("더 보기 실패: " + (e?.message || e), false));
        });
        rMoreBtn.dataset.wired = "1"; // ✅ 중복 방지
    }

    if (rListBox && !rListBox.dataset.wired) {
        rListBox.addEventListener("click", async (e) => {
            // 삭제
            const del = e.target.closest('button[data-act="rt-del"]');
            if (del) {
                const id = del.dataset.id;
                if (!confirm("이 루틴을 삭제할까요? 되돌릴 수 없습니다.")) return;
                try {
                    await deleteDoc(doc(db, "routines", id));
                    const card = del.closest(".result-card");
                    if (card) card.remove();
                    if (routineCommentUnsubs.has(id)) {
                        try {
                            routineCommentUnsubs.get(id)();
                        } catch {}
                        routineCommentUnsubs.delete(id);
                    }
                    toast("삭제 완료");
                } catch (err) {
                    toast("삭제 실패: " + (err?.message || err), false);
                }
                return;
            }

            // 댓글 열기/닫기
            const btn = e.target.closest('button[data-act="rt-toggle-comments"]');
            if (!btn) return;

            // ✅ 더블클릭/중복핸들러에 대비한 간단한 뎁스락
            if (btn.dataset.busy === "1") return;
            btn.dataset.busy = "1";

            const id = btn.dataset.id;
            const host = document.getElementById(`rtCHost-${id}`);
            if (!host) {
                btn.dataset.busy = "0";
                return;
            }

            const opened = host.style.display !== "none";
            if (opened) {
                host.style.display = "none";
                btn.textContent = "댓글 열기";
                if (routineCommentUnsubs.has(id)) {
                    try {
                        routineCommentUnsubs.get(id)();
                    } catch {}
                    routineCommentUnsubs.delete(id);
                }
            } else {
                host.style.display = "";
                btn.textContent = "댓글 0";
                attachRoutineComments(id, host, btn);

                // 🔧 혹시 attach가 실패했으면 200ms 뒤 1회 재시도
                setTimeout(() => {
                    if (!routineCommentUnsubs.has(id)) {
                        try {
                            attachRoutineComments(id, host, btn);
                        } catch {}
                    }
                }, 200);
            }

            // 150ms 후 잠금 해제(바운스 방지)
            setTimeout(() => {
                btn.dataset.busy = "0";
            }, 150);
        });

        rListBox.dataset.wired = "1"; // ✅ 중복 방지
    }
}

function firstLoadRoutines() {
    wireRoutineUI();
    routineKw = "";
    loadRoutines(true).catch(() => {});
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
        $("#statsColumn").style.display = "";
        container.classList.remove("single");
        refreshStats().catch(() => {});
    } else if (page === "appeal") {
        $("#heroTitle").textContent = "이의 신청";
        $("#heroDesc").textContent = "오해가 있었다면 근거를 첨부해 설명해주세요.";
        $("#statsColumn").style.display = "none";
        container.classList.add("single");
    } else if (page === "lookup") {
        $("#heroTitle").textContent = "트롤 조회";
        $("#heroDesc").textContent = "닉네임/설명으로 검색하고 더 보기로 이어보세요.";
        $("#statsColumn").style.display = "none";
        container.classList.add("single");
        firstLoadLookup();
    } else if (page === "routines") {
        $("#heroTitle").textContent = "루틴 공유";
        $("#heroDesc").textContent = "Aim Lab / Kovaaks 루틴을 공유하고 찾아보세요.";
        $("#statsColumn").style.display = "none";
        container.classList.add("single");
        firstLoadRoutines();
    } else if (page === "admin") {
        $("#heroTitle").textContent = "관리자 승인";
        $("#heroDesc").textContent = "승인 대기 중인 신고 & 이의 신청을 처리합니다.";
        $("#statsColumn").style.display = "none";
        container.classList.add("single");
        if (lastPendingSnap) renderPendingFromSnapshot(lastPendingSnap);
        else loadPending();
        if (lastAppealSnap) renderAppealsFromSnapshot(lastAppealSnap);
    }
}
function wireNavLinks() {
    $$(".nav-link").forEach((a) =>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            activatePage(a.dataset.page);
        })
    );
}

/* ---------------- Auth ---------------- */
$("#btnLogin")?.addEventListener("click", async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
        toast("로그인 실패: " + e.message, false);
    }
});
$("#btnLogout")?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        $("#btnLogin")?.classList.add("hidden");
        $("#btnLogout")?.classList.remove("hidden");

        const token = await user.getIdTokenResult(true);
        isAdmin = token.claims?.role === "admin";
        toggleAdminTab(isAdmin);

        try {
            const prof = await fetchMyProfile(user.uid);
            if (prof?.nickname) {
                myNickname = prof.nickname;
                myNicknameLower = prof.nicknameLower || prof.nickname.toLowerCase();
            } else {
                myNickname = null;
                myNicknameLower = null;
                openNickModal();
            }
        } catch {
            openNickModal();
        }

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
        $("#btnLogin")?.classList.remove("hidden");
        $("#btnLogout")?.classList.add("hidden");
        isAdmin = false;
        myNickname = null;
        myNicknameLower = null;
        toggleAdminTab(false);
        stopNotificationWatch();
        stopPendingWatch();
        stopAppealWatch();
    }
});

/* ---------------- Init ---------------- */
function init() {
    wireNavLinks();
    wireLookupUI();
    refreshStats().catch(() => {});
    const active = document.querySelector(".nav-link.active")?.dataset.page || "report";
    activatePage(active);
    ensureNicknameModal();
}
document.addEventListener("DOMContentLoaded", init);

/* =========================================================
   ✅ 추가 기능 패치 (기존 코드 아래에 그대로 붙여넣기)
   - 등록: 여러 링크 입력/저장 (proofs 배열 + proof 호환)
   - 조회: 작성자 전용 [수정] 버튼 + 모달에서 내용/링크 수정
   - 디자인: 버튼/모달 클래스 자동 적용 (style.css와 연동)
========================================================= */

/* -------- 공용 -------- */
const __isValidHttpUrl = (u) => {
    try {
        const x = new URL(u);
        return x.protocol === "http:" || x.protocol === "https:";
    } catch {
        return false;
    }
};
const __q = (s, r = document) => r.querySelector(s);
const __qa = (s, r = document) => Array.from(r.querySelectorAll(s));
const __add = (el, ...cls) => el && el.classList && cls.forEach((c) => el.classList.add(c));

/* =========================================================
   1) 등록 화면: rProof 유지 + 추가 링크 UI/로직
========================================================= */
(function installMultiProofEnhancer() {
    const rootInput = document.getElementById("rProof");
    const btn = document.getElementById("btnReport");
    if (!rootInput || !btn) return;

    // UI 주입(디자인은 style.css의 버튼 클래스로 통일)
    const wrap = document.createElement("div");
    wrap.id = "extraProofWrap";
    wrap.style.marginTop = "8px";
    wrap.innerHTML = `
    <div class="field-label" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>증거 링크 추가</span>
      <button type="button" class="btn-inline-ghost btn-sm btn-inline" id="btnAddProofExtra">+ 링크 추가</button>
    </div>
    <div id="extraProofList" style="display:grid;gap:8px"></div>
    <div class="helper-text">여러 개를 넣으면 배열로 저장됩니다. 첫 번째 링크는 기존 'proof' 필드에도 함께 저장됩니다.</div>
  `;
    rootInput.insertAdjacentElement("afterend", wrap);

    const listBox = document.getElementById("extraProofList");
    const addBtn = document.getElementById("btnAddProofExtra");

    function addRow(val = "") {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.alignItems = "center";
        row.innerHTML = `
      <input type="url" placeholder="https://..." value="${(val || "").replace(/"/g, "&quot;")}" style="flex:1" />
      <button type="button" class="btn-inline-ghost btn-sm btn-inline btn-del-proof">삭제</button>
    `;
        listBox.appendChild(row);
    }
    addBtn?.addEventListener("click", () => addRow(""));
    listBox?.addEventListener("click", (e) => {
        const b = e.target.closest(".btn-del-proof");
        if (!b) return;
        b.parentElement?.remove();
    });

    function collectProofs() {
        const base = String(rootInput.value || "").trim();
        const extras = [...listBox.querySelectorAll('input[type="url"]')].map((i) => String(i.value || "").trim());
        const merged = [base, ...extras].filter(Boolean);
        const out = [];
        for (const u of merged) {
            if (__isValidHttpUrl(u) && !out.includes(u)) out.push(u);
        }
        return out;
    }

    // 기존 클릭 핸들러를 캡처 단계에서 가로채 확장 로직 실행
    btn.addEventListener(
        "click",
        async (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            const riotId = document.getElementById("rRiotId")?.value?.trim();
            const category = document.getElementById("rCategory")?.value?.trim();
            const desc = document.getElementById("rDesc")?.value?.trim();

            if (!riotId || !riotId.includes("#")) return toast("라이엇 ID는 '닉네임#태그' 형식입니다.", false);
            if (!category) return toast("카테고리를 선택하세요.", false);
            if (!desc || desc.length < 10) return toast("설명을 10자 이상 입력하세요.", false);
            if (typeof containsProfanity === "function" && containsProfanity(desc))
                return toast("설명에 비속어가 포함되어 있습니다.", false);

            const proofs = collectProofs();
            if (proofs.length === 0) return toast("유효한 증거 링크를 1개 이상 입력하세요.", false);

            try {
                const riotIdNorm = typeof normRiotId === "function" ? normRiotId(riotId) : riotId.toLowerCase();
                if (window.auth?.currentUser) {
                    if (!window.myNickname) {
                        if (typeof openNickModal === "function") openNickModal();
                        return;
                    }
                    if (typeof hasRecentSame === "function") {
                        const dup = await hasRecentSame(window.auth.currentUser.uid, riotIdNorm);
                        if (dup) return toast("같은 대상에 대한 최근 신고가 있어요.", false);
                    }
                }
                btn.disabled = true;

                await addDoc(collection(db, "reports"), {
                    riotId,
                    riotIdNorm,
                    category,
                    description: desc,
                    proofs, // ✅ 여러 링크
                    proof: proofs[0], // ✅ 구버전 호환
                    status: "pending",
                    createdAt: serverTimestamp(),
                    createdBy: auth?.currentUser ? auth.currentUser.uid : null,
                    createdByNick: window.myNickname || null
                });

                toast("신고가 접수되었습니다. 검토 후 알림으로 알려드릴게요.");

                // 입력 초기화
                document.getElementById("rRiotId").value = "";
                document.getElementById("rCategory").value = "";
                document.getElementById("rDesc").value = "";
                rootInput.value = "";
                listBox.innerHTML = "";

                try {
                    if (typeof refreshStats === "function") refreshStats();
                } catch {}
            } catch (err) {
                toast("등록 실패: " + (err?.message || err), false);
            } finally {
                btn.disabled = false;
            }
        },
        { capture: true }
    );
})();

/* =========================================================
   2) 조회: 작성자 전용 [수정] 버튼 동적 추가 + 수정 모달
========================================================= */
(function installOwnerEditButton() {
    const host = document.getElementById("resultList");
    if (!host) return;

    async function tryAppendEditButton(card) {
        if (card.__ownerEditBound) return;
        card.__ownerEditBound = true;

        const cBtn = card.querySelector('button[data-act="toggle-comments"][data-id]');
        const reportId = cBtn?.dataset?.id;
        if (!reportId) return;

        try {
            const snap = await getDoc(doc(db, "reports", reportId));
            if (!snap.exists()) return;
            const data = snap.data();
            const uid = auth?.currentUser?.uid;
            if (!uid || data.createdBy !== uid) return;

            // 버튼 영역 추정(댓글 버튼 옆)
            const btnRow = cBtn.parentElement || card;
            const editBtn = document.createElement("button");
            editBtn.className = "btn-inline-ghost";
            editBtn.dataset.act = "edit-report2";
            editBtn.dataset.id = reportId;
            editBtn.textContent = "수정";

            // 삭제 버튼 기준으로 그 앞에 꽂아 넣기
            const delBtn = btnRow.querySelector('button[data-act="delete-approved"]');
            if (delBtn) delBtn.insertAdjacentElement("beforebegin", editBtn);
            else btnRow.appendChild(editBtn);
        } catch {}
    }

    // 초기/추가 카드에 적용
    __qa(".result-card", host).forEach(tryAppendEditButton);
    new MutationObserver((muts) => {
        for (const m of muts) {
            m.addedNodes?.forEach((n) => {
                if (n.nodeType === 1 && n.classList?.contains("result-card")) tryAppendEditButton(n);
            });
        }
    }).observe(host, { childList: true });

    // 수정 모달 열기
    host.addEventListener("click", (e) => {
        const b = e.target.closest('button[data-act="edit-report2"]');
        if (!b) return;
        e.preventDefault();
        openReportEditModal2(b.dataset.id, b.closest(".result-card"));
    });
})();

/* 모달 DOM/동작 */
(function () {
    function ensureModal() {
        if (document.getElementById("editReportModal2")) return;
        const backdrop = document.createElement("div");
        backdrop.id = "editReportModal2";
        backdrop.innerHTML = `
      <div class="modal-card">
        <h3>신고 수정</h3>
        <label class="field-label">설명</label>
        <textarea id="erDesc" rows="5" placeholder="설명"></textarea>

        <div class="field-label" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>증거 링크</span>
          <button id="erAdd" type="button" class="btn-inline-ghost btn-sm btn-inline">+ 링크 추가</button>
        </div>
        <div id="erList" style="display:grid;gap:8px;margin-bottom:10px"></div>

        <div class="btn-row">
          <button id="erCancel" class="btn-inline-ghost btn-sm btn-inline">취소</button>
          <button id="erSave" class="btn-submit btn-sm btn-inline">저장</button>
        </div>
      </div>`;
        document.body.appendChild(backdrop);

        // 삭제 버튼 위임
        backdrop.addEventListener("click", (e) => {
            const b = e.target.closest(".er-del");
            if (!b) return;
            b.parentElement?.remove();
        });

        // 취소
        backdrop.querySelector("#erCancel").addEventListener("click", () => (backdrop.style.display = "none"));

        // + 링크 추가
        backdrop.querySelector("#erAdd").addEventListener("click", () => addRow(""));

        function addRow(val = "") {
            const row = document.createElement("div");
            row.className = "er-row";
            row.innerHTML = `
        <input type="url" placeholder="https://..." value="${(val || "").replace(/"/g, "&quot;")}" style="flex:1" />
        <button type="button" class="btn-inline-ghost btn-sm btn-inline er-del">삭제</button>
      `;
            backdrop.querySelector("#erList").appendChild(row);
        }
        backdrop.__addRow = addRow;
    }
    ensureModal();

    window.openReportEditModal2 = async function (reportId, cardEl) {
        const uid = auth?.currentUser?.uid;
        if (!uid) return toast("로그인이 필요합니다.", false);

        const snap = await getDoc(doc(db, "reports", reportId));
        if (!snap.exists()) return toast("문서를 찾을 수 없습니다.", false);
        const d = snap.data();
        if (d.createdBy !== uid) return toast("수정 권한이 없습니다.", false);

        const modal = document.getElementById("editReportModal2");
        const erDesc = modal.querySelector("#erDesc");
        const erList = modal.querySelector("#erList");

        erDesc.value = d.description || "";
        erList.innerHTML = "";

        const arr = Array.isArray(d.proofs) ? d.proofs : d.proof ? [d.proof] : [];
        if (arr.length) {
            arr.forEach((u) => modal.__addRow(u));
        } else {
            modal.__addRow("");
        }

        modal.style.display = "grid";

        modal.querySelector("#erSave").onclick = async () => {
            const desc = String(erDesc.value || "").trim();
            if (!desc || desc.length < 10) return toast("설명을 10자 이상 입력하세요.", false);
            if (typeof containsProfanity === "function" && containsProfanity(desc))
                return toast("설명에 비속어가 포함되어 있습니다.", false);

            const urls = [...erList.querySelectorAll('input[type="url"]')]
                .map((i) => String(i.value || "").trim())
                .filter(Boolean);
            const uniq = [];
            for (const u of urls) {
                if (__isValidHttpUrl(u) && !uniq.includes(u)) uniq.push(u);
            }
            if (uniq.length === 0) return toast("증거 링크를 1개 이상 입력하세요.", false);

            try {
                await updateDoc(doc(db, "reports", reportId), {
                    description: desc,
                    proofs: uniq,
                    proof: uniq[0],
                    updatedAt: serverTimestamp()
                });

                // 카드 즉시 반영
                if (cardEl) {
                    const descEl = cardEl.querySelector(".report-desc");
                    if (descEl) descEl.textContent = desc;
                    // 기존 한 개만 노출하던 영역이 있다면 첫 링크만 즉시 갱신
                    const firstProofA = cardEl.querySelector(".result-meta a.result-proof");
                    if (firstProofA) firstProofA.href = uniq[0];
                }

                toast("수정 완료");
                modal.style.display = "none";
            } catch (e) {
                toast("수정 실패: " + (e?.message || e), false);
            }
        };
    };
})();

/* =========================================================
   3) 버튼 스타일 보정(동적 요소 포함)
========================================================= */
(function unifyButtonLook() {
    function apply() {
        // 조회 카드의 '수정' 버튼
        __qa('#resultList button[data-act="edit-report2"]').forEach((b) =>
            __add(b, "btn-inline-ghost", "btn-sm", "btn-inline")
        );
        // 댓글 열기 버튼 – 작은 파란 버튼로
        __qa('#resultList button[data-act="toggle-comments"]').forEach((b) =>
            __add(b, "btn-submit", "btn-sm", "btn-inline")
        );
        // 등록 화면 추가 링크 삭제 버튼
        __qa("#extraProofList .btn-del-proof").forEach((b) => __add(b, "btn-inline-ghost", "btn-sm", "btn-inline"));
    }
    apply();
    new MutationObserver(apply).observe(document.body, { subtree: true, childList: true });
})();

/* ====== 버튼 순서 정렬 패치: 삭제 버튼을 '수정' 오른쪽으로 ====== */
(function orderButtonsOnCards() {
    const host = document.getElementById("resultList");
    if (!host) return;

    function fixRow(row) {
        if (!row) return;
        const editBtn = row.querySelector('button[data-act="edit-report2"]');
        const delBtn = row.querySelector('button[data-act="delete-approved"]');
        const cmtBtn = row.querySelector('button[data-act="toggle-comments"]');

        // 1) 댓글 버튼을 항상 맨 앞
        if (cmtBtn) row.insertAdjacentElement("afterbegin", cmtBtn);

        // 2) 수정 버튼이 있으면 그 다음에 붙이고, 삭제는 수정 오른쪽으로 이동
        if (editBtn) {
            // 혹시 수정 버튼이 맨 앞/뒤에 있으면 댓글 뒤로 이동
            if (cmtBtn && editBtn.previousElementSibling !== cmtBtn) {
                cmtBtn.insertAdjacentElement("afterend", editBtn);
            }
            if (delBtn) editBtn.insertAdjacentElement("afterend", delBtn);
        } else if (delBtn && cmtBtn) {
            // (안전망) 수정 버튼이 없는 경우엔 댓글 뒤로 삭제를 보냄
            cmtBtn.insertAdjacentElement("afterend", delBtn);
        }
    }

    function sweep() {
        host.querySelectorAll(".result-card .btn-row").forEach(fixRow);
    }

    // 초기 실행
    sweep();

    // 카드가 추가/갱신될 때도 자동 정렬
    new MutationObserver((muts) => {
        muts.forEach((m) => {
            m.addedNodes?.forEach((n) => {
                if (n.nodeType === 1) {
                    if (n.matches?.(".result-card .btn-row")) fixRow(n);
                    const rows = n.querySelectorAll?.(".result-card .btn-row");
                    rows?.forEach(fixRow);
                }
            });
        });
    }).observe(host, { childList: true, subtree: true });
})();

/* =========================================================
   공유된 루틴 카드: 본인 글에 "수정" 버튼 추가 + 수정 모달
   (기존 코드/렌더러는 건드리지 않음)
========================================================= */
(function installRoutineOwnerEdit() {
    const host = document.getElementById("routineList");
    if (!host) return;

    // 루틴 카드에서 routineId 추출 (여러 케이스 지원)
    function getRoutineId(card) {
        // 댓글 버튼/삭제 버튼 등에 data-id가 붙는 경우 지원
        const btn =
            card.querySelector('button[data-act="toggle-routine-comments"][data-id]') ||
            card.querySelector('button[data-act="delete-routine"][data-id]');
        if (btn?.dataset?.id) return btn.dataset.id;

        // 카드 자체에 data-id가 있는 경우
        if (card.dataset?.id) return card.dataset.id;

        return null;
    }

    async function tryAppendEdit(card) {
        if (card.__routineEditBound) return; // 중복 방지
        const id = getRoutineId(card);
        if (!id || !auth?.currentUser) return;

        // 권한 확인
        try {
            const snap = await getDoc(doc(db, "routines", id));
            if (!snap.exists()) return;
            const data = snap.data();
            const isOwner = data.createdBy === auth.currentUser.uid || data.uid === auth.currentUser.uid;
            if (!isOwner) return;

            // 버튼 줄 찾기(댓글/삭제가 있는 곳)
            const btnRow = card.querySelector(".btn-row") || card.querySelector("div") || card; // 아주 보호적 fallback

            // 이미 수정 버튼이 있으면 스킵
            if (btnRow.querySelector('button[data-act="edit-routine2"]')) return;

            // 수정 버튼 추가
            const editBtn = document.createElement("button");
            editBtn.className = "btn-inline-ghost btn-sm btn-inline";
            editBtn.dataset.act = "edit-routine2";
            editBtn.dataset.id = id;
            editBtn.textContent = "수정";
            // 댓글 버튼 다음/삭제 버튼 앞 위치에 넣기
            const cmtBtn = btnRow.querySelector('button[data-act="toggle-routine-comments"]');
            if (cmtBtn) cmtBtn.insertAdjacentElement("afterend", editBtn);
            else btnRow.appendChild(editBtn);

            // 삭제 버튼이 있다면 수정 오른쪽으로
            const delBtn = btnRow.querySelector('button[data-act="delete-routine"]');
            if (delBtn) editBtn.insertAdjacentElement("afterend", delBtn);

            // 클릭 시 모달 열기
            editBtn.addEventListener("click", () => openEditRoutineModal2(id, card));

            card.__routineEditBound = true;
        } catch {}
    }

    // 기존 카드들 적용
    host.querySelectorAll(".result-card").forEach(tryAppendEdit);

    // 동적으로 추가되는 카드에도 적용
    new MutationObserver((muts) => {
        muts.forEach((m) => {
            m.addedNodes?.forEach((n) => {
                if (n.nodeType === 1 && n.classList?.contains("result-card")) tryAppendEdit(n);
            });
        });
    }).observe(host, { childList: true, subtree: true });

    /* -------- 루틴 수정 모달 -------- */
    function ensureRoutineModal() {
        if (document.getElementById("editRoutineModal2")) return;
        const backdrop = document.createElement("div");
        backdrop.id = "editRoutineModal2";
        // 카드 내용(신고 수정 모달과 동일한 구조/클래스 사용)
        backdrop.innerHTML = `
      <div class="modal-card">
        <h3>루틴 수정</h3>

        <label class="field-label">제목</label>
        <input id="rutTitle" type="text" placeholder="루틴 제목" />

        <label class="field-label">플레이리스트 링크</label>
        <input id="rutPlaylist" type="url" placeholder="Aim Lab 또는 Kovaaks 링크" />

        <label class="field-label">설명</label>
        <textarea id="rutDesc" rows="5" placeholder="설명"></textarea>

        <div class="btn-row">
          <button id="rutCancel" class="btn-inline-ghost btn-sm btn-inline">취소</button>
          <button id="rutSave" class="btn-submit btn-sm btn-inline">저장</button>
        </div>
      </div>`;
        document.body.appendChild(backdrop);

        backdrop.querySelector("#rutCancel").addEventListener("click", () => (backdrop.style.display = "none"));
    }
    ensureRoutineModal();

    // 모달 열기
    window.openEditRoutineModal2 = async function (routineId, cardEl) {
        if (!auth?.currentUser) return toast("로그인이 필요합니다.", false);

        const snap = await getDoc(doc(db, "routines", routineId));
        if (!snap.exists()) return toast("문서를 찾을 수 없습니다.", false);
        const d = snap.data();
        const isOwner = d.createdBy === auth.currentUser.uid || d.uid === auth.currentUser.uid;
        if (!isOwner) return toast("수정 권한이 없습니다.", false);

        const modal = document.getElementById("editRoutineModal2");
        const $t = modal.querySelector("#rutTitle");
        const $p = modal.querySelector("#rutPlaylist");
        const $d = modal.querySelector("#rutDesc");

        // 필드 이름이 프로젝트마다 다를 수 있어 안전하게 채움
        $t.value = d.title || d.rtTitle || "";
        $p.value = d.playlist || d.rtPlaylist || d.playlistUrl || "";
        $d.value = d.desc || d.description || d.rtDesc || "";

        modal.style.display = "grid";

        modal.querySelector("#rutSave").onclick = async () => {
            const title = String($t.value || "").trim();
            const playlist = String($p.value || "").trim();
            const desc = String($d.value || "").trim();
            if (!title) return toast("제목을 입력하세요.", false);
            if (!desc || desc.length < 10) return toast("설명을 10자 이상 입력하세요.", false);
            try {
                await updateDoc(doc(db, "routines", routineId), {
                    title,
                    playlist,
                    desc,
                    updatedAt: serverTimestamp()
                });

                // 카드 즉시 반영(가능한 범위)
                if (cardEl) {
                    const titleEl = cardEl.querySelector(".result-name");
                    const descEl = cardEl.querySelector(".result-desc");
                    if (titleEl) titleEl.textContent = title;
                    if (descEl) descEl.textContent = desc;
                }

                toast("수정 완료");
                modal.style.display = "none";
            } catch (e) {
                toast("수정 실패: " + (e?.message || e), false);
            }
        };
    };
})();

/* ===== 루틴 카드: '수정' 버튼 주입 + 버튼 순서 고정 (댓글→수정→삭제) ===== */
(function patchRoutineCards() {
    const host = document.getElementById("routineList");
    if (!host) return;

    // 카드 하나 처리
    async function enhance(card) {
        if (!card || card.__patched) return;
        const id = card.getAttribute("data-routine");
        if (!id || !auth?.currentUser) return;

        // 본인 글인지 확인
        try {
            const snap = await getDoc(doc(db, "routines", id));
            if (!snap.exists()) return;
            const data = snap.data();
            const isOwner = data.createdBy === auth.currentUser.uid || data.uid === auth.currentUser.uid;
            const row = card.querySelector(".btn-row") || card;

            // --- 버튼 순서 고정 helper ---
            const orderButtons = () => {
                const cmt = row.querySelector('button[data-act="rt-toggle-comments"]');
                const edt = row.querySelector('button[data-act="edit-routine3"]');
                const del = row.querySelector('button[data-act="rt-del"]');
                if (cmt) row.insertAdjacentElement("afterbegin", cmt);
                if (edt) {
                    if (cmt) cmt.insertAdjacentElement("afterend", edt);
                    else row.insertAdjacentElement("afterbegin", edt);
                }
                if (del) {
                    const anchor = edt || cmt;
                    if (anchor) anchor.insertAdjacentElement("afterend", del);
                    else row.appendChild(del);
                }
            };

            // --- 수정 버튼이 없으면 생성(작성자만) ---
            if (isOwner && !row.querySelector('button[data-act="edit-routine3"]')) {
                const editBtn = document.createElement("button");
                editBtn.className = "btn-inline-ghost btn-sm btn-inline";
                editBtn.dataset.act = "edit-routine3";
                editBtn.dataset.id = id;
                editBtn.textContent = "수정";
                // 댓글 버튼 뒤에 끼워 넣기
                const cmt = row.querySelector('button[data-act="rt-toggle-comments"]');
                if (cmt) cmt.insertAdjacentElement("afterend", editBtn);
                else row.appendChild(editBtn);

                // 기존 모달 열기 함수 재사용
                editBtn.addEventListener("click", () => {
                    if (typeof openEditRoutineModal2 === "function") {
                        openEditRoutineModal2(id, card);
                    } else {
                        toast("수정 모달을 찾을 수 없습니다.", false);
                    }
                });
            }

            // 삭제 버튼이 있으면 수정 오른쪽으로 재배치
            orderButtons();

            card.__patched = true;
        } catch {
            /* pass */
        }
    }

    // 초기 적용
    host.querySelectorAll(".result-card").forEach(enhance);

    // 동적 추가 대응
    new MutationObserver((muts) => {
        muts.forEach((m) => {
            m.addedNodes?.forEach((n) => {
                if (n.nodeType === 1) {
                    if (n.classList?.contains("result-card")) enhance(n);
                    n.querySelectorAll?.(".result-card")?.forEach(enhance);
                }
            });
        });
    }).observe(host, { childList: true, subtree: true });
})();
