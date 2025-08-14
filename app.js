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

    // 하단으로 내린 버튼들
    const controls = canEdit
        ? `
    <button class="btn-submit btn-ghost btn-sm" data-act="c-edit" data-id="${c.id}">수정</button>
    <button class="btn-submit btn-danger btn-sm" data-act="c-del"  data-id="${c.id}">삭제</button>
  `
        : "";

    return `
    <div class="comment-item" data-id="${c.id}"
         style="background:#111a27; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 10px;">
      <!-- 상단: 작성자만 -->
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <div style="font-weight:800; color:#cfe4ff">${escapeHtml(c.nickname || "익명")}</div>
      </div>

      <!-- 본문(설명) -->
      <div class="comment-text" style="color:#d6dfeb; font-size:13px; margin-top:4px;">${escapeHtml(c.text || "")}</div>

      <!-- 하단: 날짜/수정됨 + 액션버튼 -->
      <div class="comment-footer">
        <div>${dateStr}${edited}</div>
        <div class="comment-actions">${controls}</div>
      </div>
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
    if (rQueryInput) {
        const onType = debounce(() => {
            routineKw = rQueryInput.value.trim();
            loadRoutines(true).catch((e) => toast("검색 실패: " + (e?.message || e), false));
        }, 250);
        rQueryInput.addEventListener("input", onType);
    }
    rMoreBtn?.addEventListener("click", () => {
        loadRoutines(false).catch((e) => toast("더 보기 실패: " + (e?.message || e), false));
    });

    // 댓글 토글 위임(루틴 카드)
    if (rListBox) {
        rListBox.addEventListener("click", async (e) => {
            // ① 삭제
            const del = e.target.closest('button[data-act="rt-del"]');
            if (del) {
                const id = del.dataset.id;
                if (!isAdmin && !(auth.currentUser && del.closest(".result-card")?.getAttribute("data-routine"))) {
                    // 소유자 체크는 서버 규칙이 최종 보증. 여기선 단순 경고만.
                }
                if (!confirm("이 루틴을 삭제할까요? 되돌릴 수 없습니다.")) return;
                try {
                    await deleteDoc(doc(db, "routines", id));
                    // 카드 제거 + 댓글 실시간 구독 해제
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

            // ② 댓글 열기/닫기 (기존 코드 유지, 아래 “열기 실패” 보완 포함)
            const btn = e.target.closest('button[data-act="rt-toggle-comments"]');
            if (!btn) return;
            const id = btn.dataset.id;
            const host = document.getElementById(`rtCHost-${id}`);
            if (!host) return;

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

                // 🔧 새로 등록 직후 DOM/쿼리 타이밍 이슈 대비: 구독이 안 붙었으면 짧게 재시도
                setTimeout(() => {
                    if (!routineCommentUnsubs.has(id)) {
                        try {
                            attachRoutineComments(id, host, btn);
                        } catch {}
                    }
                }, 200);
            }
        });
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
