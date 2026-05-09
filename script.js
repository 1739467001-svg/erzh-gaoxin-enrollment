// ============================================================
// 全局状态
// ============================================================
let currentUser = null;
let allStudents = [];
let signPreviewStudents = [];

const API_BASE = '';
const AUTH_STORAGE_KEY = 'studentRecognitionCurrentUser';
const PAGE_STORAGE_KEY = 'studentRecognitionActivePage';

function persistCurrentUser() {
    if (!currentUser) return;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
}

function persistActivePage(pageId) {
    if (!pageId || pageId === 'loginPage') {
        localStorage.removeItem(PAGE_STORAGE_KEY);
        return;
    }
    localStorage.setItem(PAGE_STORAGE_KEY, pageId);
}

function clearLoginState() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(PAGE_STORAGE_KEY);
}

function restoreCurrentUser() {
    try {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        if (!parsed || !parsed.username || !parsed.role || !parsed.name) return null;
        return parsed;
    } catch (e) {
        clearLoginState();
        return null;
    }
}

function getSavedActivePage() {
    return localStorage.getItem(PAGE_STORAGE_KEY) || 'adminPage';
}

function restoreUserSession() {
    const savedUser = restoreCurrentUser();
    if (!savedUser) return;
    currentUser = savedUser;
    showMainPage(getSavedActivePage());
}

function openSavedPage(pageId) {
    switch (pageId) {
        case 'registerPage':
            switchToRegister();
            break;
        case 'addStudentPage':
            switchToAddStudent();
            break;
        case 'editPage':
            switchToAdmin();
            break;
        case 'userManagementPage':
            if (currentUser.role === 'admin') {
                switchToUserManagement();
            } else {
                switchToAdmin();
            }
            break;
        case 'statsPage':
            if (currentUser.role === 'admin' || currentUser.role === 'manager') {
                switchToStats();
            } else {
                switchToAdmin();
            }
            break;
        case 'logsPage':
            if (currentUser.role === 'admin') {
                switchToLogs();
            } else {
                switchToAdmin();
            }
            break;
        case 'signContractPage':
            switchToSignContract();
            break;
        case 'examPapersPage':
            switchToExamPapers();
            break;
        default:
            switchToAdmin();
            break;
    }
}

function requireCurrentUser() {
    if (currentUser) return true;
    clearLoginState();
    showPage('loginPage');
    return false;
}

function syncCurrentUserDisplay() {
    if (!currentUser) return;
    const displayText = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    ['currentUser', 'currentUserAdmin', 'currentUserAddStudent', 'currentUserEdit', 'currentUserUserManagement', 'currentUserStats', 'currentUserLogs', 'currentUserSign', 'currentUserExam']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = displayText;
        });
}

function isProtectedPage(pageId) {
    return pageId && pageId !== 'loginPage';
}

function handleSessionExpired() {
    currentUser = null;
    clearLoginState();
    stopAutoRefresh();
    showPage('loginPage');
    document.getElementById('loginError').textContent = '登录状态已失效，请重新登录';
}

async function fetchWithAuth(url, options = {}) {
    const response = await fetch(url, options);
    if (response.status === 401) {
        handleSessionExpired();
        throw new Error('登录状态已失效');
    }
    return response;
}

function guardedPageSwitch(pageId, callback) {
    if (!requireCurrentUser()) return;
    callback();
    if (isProtectedPage(pageId)) persistActivePage(pageId);
}

function refreshActivePage() {
    const page = _currentActivePage;
    if (!page || !currentUser) return;
    switch (page) {
        case 'adminPage':
            loadStudents();
            break;
        case 'statsPage':
            loadStatistics();
            break;
        case 'logsPage':
            loadLogs();
            break;
        case 'userManagementPage':
            loadUsers();
            break;
        case 'examPapersPage':
            loadExamPapers();
            break;
    }
}

function showMainPage(targetPage = 'adminPage') {
    if (!requireCurrentUser()) return;
    syncCurrentUserDisplay();
    openSavedPage(targetPage);
}

function showPage(pageId) {
    closeAllMobileMenus();
    document.querySelectorAll('.page').forEach(p => {
        p.style.display = 'none';
        p.style.visibility = 'hidden';
    });
    const el = document.getElementById(pageId);
    el.style.visibility = 'visible';
    el.style.display = (pageId === 'loginPage') ? 'flex' : 'block';
    _currentActivePage = pageId;
    if (pageId === 'loginPage') {
        stopAutoRefresh();
        localStorage.removeItem(PAGE_STORAGE_KEY);
    } else {
        persistActivePage(pageId);
        startAutoRefresh();
    }
}


// ============================================================
// 数据一致性：自动轮询刷新机制
// 每 15 秒自动刷新当前活跃页面的数据，确保多用户操作实时同步
// ============================================================
let _refreshTimer = null;
let _currentActivePage = null;

function startAutoRefresh() {
    stopAutoRefresh();
    _refreshTimer = setInterval(() => {
        if (!currentUser) return;
        refreshActivePage();
    }, 15000);
}

function stopAutoRefresh() {
    if (_refreshTimer) {
        clearInterval(_refreshTimer);
        _refreshTimer = null;
    }
}

// ============================================================
// 手机端汉堡菜单
// ============================================================
function toggleMobileMenu(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    menu.classList.toggle('mobile-open');
}

function closeAllMobileMenus() {
    document.querySelectorAll('.header-right.mobile-open').forEach(m => {
        m.classList.remove('mobile-open');
    });
}

// ============================================================
// 学校数据（来源：杭州初中学校Excel）
// ============================================================
const SCHOOL_DATA = {
  '上城区': ['建兰中学','采荷实验学校','杭州中学','钱学森学校','开元中学','惠兴中学','江城中学','勇进实验学校','杭州第十中学','清河实验学校','彭扬中学','彭诚中学','钱江外国语实验学校','采荷中学','钱江新城实验学校','笕桥实验中学','天杭实验学校','景荷中学','丁荷中学','四季青中学','丁兰实验中学','东城中学','东城实验学校','东城第二实验学校','夏衍初级中学','浙江省教育科学研究院附属实验学校','丁蕙实验中学','笕成中学','杭州天成教育集团','景芳中学','杭州第六中学'],
  '拱墅区': ['文澜中学+文澜实验','星澜中学','育才中学','育才大城北学校','锦绣中学','启正中学','观成实验学校','观成武林中学','大成岳家湾实验学校','大成实验学校','风华中学','春蕾中学','青春中学','朝晖中学','胜蓝中学','景成实验学校','风帆中学','明珠实验学校','安吉路实验学校','安吉路教育集团新天地实验学校','行知中学','上海世外学校','华东师范大学附属杭州学校','杭州北苑实验中学','大关中学','大关实验中学','拱宸中学','文晖中学','杭师大文晖实验学校','启航中学','树兰中学','康桥中学','长阳中学','桃源中学'],
  '西湖区': ['公益中学','之江实验中学','十三中教育集团(总校)','嘉绿苑中学','保俶塔实验学校','保俶塔申花实验学校','第十五中学教育集团(浙大附初)','第十五中学教育集团(崇德校区)','丰潭中学','景汇中学','周浦、袁浦中学(也称双浦)','西湖第一实验学校','西溪中学','三墩中学','弘益中学','西子实验学校','西溪实验学校','杭州云谷学校','上泗中学','紫金港中学','翠苑中学','文华中学','文理中学','杭州仁和实验学校','文溪中学','浙江工业大学附属实验学校'],
  '滨江区': ['杭州二中白马湖学校','杭州湖畔学校','长河中学','江南实验学校','闻涛中学','高新实验学校','滨和中学','浦沿中学','滨兰实验学校','滨兴学校','西兴中学','滨文中学','杭州竺可桢学校'],
  '钱塘区': ['启成学校','养正学校','文海实验学校','文海实验中学','文海启源中学','观澜中学','学正中学','下沙中学','实验外国语学校','景苑中学','新湾中学','义蓬中学','金沙湖实验学校']
};

// 所有学校（含"其他"）
const ALL_SCHOOLS = [...Object.values(SCHOOL_DATA).flat(), '其他'];

// ============================================================
// 学校 Autocomplete
// ============================================================
function onSchoolInput(prefix) {
    const inputId = prefix === 'reg' ? 'school' : (prefix + 'School');
    const dropdownId = prefix + 'SchoolDropdown';
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const keyword = input.value.trim();
    const districtId = prefix === 'reg' ? 'regDistrict' : (prefix + 'District');
    const districtEl = document.getElementById(districtId);
    const district = districtEl ? districtEl.value : '';

    let pool;
    if (district && district !== '其他' && SCHOOL_DATA[district]) {
        pool = [...SCHOOL_DATA[district], '其他'];
    } else {
        pool = ALL_SCHOOLS;
    }

    let matches;
    if (!keyword) {
        matches = pool.slice(0, 30);
    } else {
        matches = pool.filter(s => s.includes(keyword));
    }

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="school-dropdown-empty">无匹配学校，可直接输入</div>';
        dropdown.classList.add('show');
        return;
    }

    dropdown.innerHTML = matches.map(s => {
        const hl = keyword ? s.replace(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'), `<span class="match-highlight">${keyword}</span>`) : s;
        const safeName = s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return `<div class="school-dropdown-item" onmousedown="selectSchool('${prefix}','${safeName}')">${hl}</div>`;
    }).join('');
    dropdown.classList.add('show');
}

function selectSchool(prefix, name) {
    const inputId = prefix === 'reg' ? 'school' : (prefix + 'School');
    const dropdownId = prefix + 'SchoolDropdown';
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (input) input.value = name;
    if (dropdown) dropdown.classList.remove('show');
}

function onDistrictChange(prefix) {
    const inputId = prefix === 'reg' ? 'school' : (prefix + 'School');
    const input = document.getElementById(inputId);
    if (input) input.value = '';
    onSchoolInput(prefix);
}

// 点击其他地方关闭下拉 + 关闭移动菜单
document.addEventListener('click', function(e) {
    document.querySelectorAll('.school-dropdown.show').forEach(dd => {
        if (!dd.closest('.school-autocomplete-wrap').contains(e.target)) {
            dd.classList.remove('show');
        }
    });
    if (!e.target.closest('.header')) {
        document.querySelectorAll('.header-right.mobile-open').forEach(m => {
            m.classList.remove('mobile-open');
        });
    }
});

// ============================================================
// Toast 提示
// ============================================================
function showToast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = type ? `show ${type}` : 'show';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.className = ''; }, 2800);
}

// ============================================================
// 登录 / 登出
// ============================================================
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!username || !password) {
        document.getElementById('loginError').textContent = '请输入用户名和密码';
        return;
    }
    try {
        const res = await fetchWithAuth(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            persistCurrentUser();
            document.getElementById('password').value = '';
            document.getElementById('loginError').textContent = '';
            showMainPage(getSavedActivePage());
        } else {
            clearLoginState();
            document.getElementById('loginError').textContent = data.message || '用户名或密码错误';
        }
    } catch (e) {
        if (e.message !== '登录状态已失效') {
            document.getElementById('loginError').textContent = '网络错误，请稍后重试';
        }
    }
}

function logout() {
    currentUser = null;
    clearLoginState();
    stopAutoRefresh();
    showPage('loginPage');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginError').textContent = '';
}

// ============================================================
// 页面切换
// ============================================================

function switchToRegister() {
    guardedPageSwitch('registerPage', () => {
        showPage('registerPage');
        document.getElementById('currentUser').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        document.getElementById('adminBtn').style.display = (currentUser.role !== 'teacher') ? 'inline-block' : 'none';
    });
}

function switchToAdmin() {
    guardedPageSwitch('adminPage', () => {
        showPage('adminPage');
        document.getElementById('currentUserAdmin').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        const isAdmin = currentUser.role === 'admin';
        const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';
        const isTeacher = currentUser.role === 'teacher';
        document.getElementById('userManagementBtn').style.display = isAdmin ? 'inline-block' : 'none';
        document.getElementById('statsBtn').style.display = isManager ? 'inline-block' : 'none';
        document.getElementById('logsBtn').style.display = isAdmin ? 'inline-block' : 'none';
        const navSignBtn = document.getElementById('navSignBtn');
        if (navSignBtn) navSignBtn.style.display = (isManager || isTeacher) ? 'inline-block' : 'none';
        const btnNewStudent = document.getElementById('btnNewStudent');
        const btnImportSign = document.getElementById('btnImportSign');
        const btnExportAll = document.getElementById('btnExportAll');
        const btnTemplate = document.getElementById('btnTemplate');
        const btnClearAll = document.getElementById('btnClearAll');
        const btnAutoNumber = document.getElementById('btnAutoNumber');
        if (btnNewStudent) btnNewStudent.style.display = 'inline-block';
        if (btnImportSign) btnImportSign.style.display = isTeacher ? 'none' : 'inline-block';
        if (btnExportAll) btnExportAll.style.display = 'inline-block';
        if (btnTemplate) btnTemplate.style.display = 'inline-block';
        if (btnAutoNumber) btnAutoNumber.style.display = isManager ? 'inline-block' : 'none';
        if (btnClearAll) btnClearAll.style.display = isAdmin ? 'inline-block' : 'none';
        loadStudents();
    });
}

function switchToAddStudent() {
    guardedPageSwitch('addStudentPage', () => {
        showPage('addStudentPage');
        document.getElementById('currentUserAddStudent').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        document.getElementById('addStudentForm').reset();
    });
}

function switchToUserManagement() {
    guardedPageSwitch('userManagementPage', () => {
        showPage('userManagementPage');
        document.getElementById('currentUserUserManagement').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        loadUsers();
    });
}

function switchToSignContract() {
    guardedPageSwitch('signContractPage', () => {
        showPage('signContractPage');
        document.getElementById('currentUserSign').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        resetSignPage();
    });
}

function switchToExamPapers() {
    guardedPageSwitch('examPapersPage', () => {
        showPage('examPapersPage');
        document.getElementById('currentUserExam').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        const canUpload = currentUser && currentUser.role === 'admin';
        document.getElementById('uploadPaperCard').style.display = canUpload ? 'block' : 'none';
        loadExamPapers();
    });
}

function backFromExamPapers() {
    switchToAdmin();
}

async function switchToStats() {
    guardedPageSwitch('statsPage', () => {
        showPage('statsPage');
        document.getElementById('currentUserStats').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        loadStatistics();
    });
}

async function switchToLogs() {
    guardedPageSwitch('logsPage', () => {
        showPage('logsPage');
        document.getElementById('currentUserLogs').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        loadLogs();
    });
}

function roleLabel(role) {
    const map = { admin: '超级管理员', manager: '管理员', teacher: '认定老师' };
    return map[role] || role;
}

function canEditDelete(student) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return true;
    if (currentUser.role === 'teacher') {
        return student.assigned_teacher === currentUser.name ||
               student.assigned_teacher === currentUser.username ||
               student.teacher === currentUser.name;
    }
    return false;
}

// ============================================================
// 修改密码
// ============================================================
function showChangePwdModal() {
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('changePwdError').textContent = '';
    document.getElementById('changePwdModal').style.display = 'flex';
}

function closeChangePwdModal(event) {
    if (event && event.target !== document.getElementById('changePwdModal')) return;
    document.getElementById('changePwdModal').style.display = 'none';
}

async function submitChangePassword() {
    const oldPwd = document.getElementById('oldPassword').value.trim();
    const newPwd = document.getElementById('newPassword').value.trim();
    const confirmPwd = document.getElementById('confirmPassword').value.trim();
    const errEl = document.getElementById('changePwdError');
    errEl.textContent = '';

    if (!oldPwd || !newPwd || !confirmPwd) { errEl.textContent = '请填写所有密码字段'; return; }
    if (newPwd.length < 6) { errEl.textContent = '新密码至少需要6位'; return; }
    if (newPwd !== confirmPwd) { errEl.textContent = '两次输入的新密码不一致'; return; }
    try {
        const res = await fetch(`${API_BASE}/api/users/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, old_password: oldPwd, new_password: newPwd })
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('changePwdModal').style.display = 'none';
            showToast('密码修改成功！', 'success');
        } else {
            errEl.textContent = result.message || '修改失败';
        }
    } catch (e) {
        errEl.textContent = '网络错误，请重试';
    }
}

// ============================================================
// 一键编号（管理员及以上）
// 按当前列表展示顺序，从 2600001 开始依次写入数据库
// ============================================================
function getCurrentFilteredStudents() {
    const keyword  = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const signed   = document.getElementById('filterSigned')?.value || '';
    const district = document.getElementById('filterDistrict')?.value || '';
    const teacher  = document.getElementById('filterTeacher')?.value || '';
    const cls      = document.getElementById('filterClass')?.value || '';

    return allStudents.filter(s => {
        if (keyword && !(
            (s.name || '').toLowerCase().includes(keyword) ||
            (s.school || '').toLowerCase().includes(keyword) ||
            (s.phone1 || '').includes(keyword)
        )) return false;
        if (signed !== '') {
            const isSigned = !!(s.recognition_no || s.is_signed);
            if (signed === '1' && !isSigned) return false;
            if (signed === '0' && isSigned) return false;
        }
        if (district && (s.district || '') !== district) return false;
        if (teacher  && (s.assigned_teacher || s.teacher || '') !== teacher) return false;
        if (cls      && (s.promised_class || '') !== cls) return false;
        return true;
    });
}

async function autoNumberStudents() {
    // 一键编号：按数据库全量数据的 id 顺序重新编号，与分页/筛选无关
    const confirmed = window.confirm(
        `即将对数据库中【全部】学生按入库先后顺序重新分配认定编号，\n编号从 2600001 开始依次递增。\n\n原有编号将被全部覆盖，确认执行？`
    );
    if (!confirmed) return;

    const btn = document.getElementById('btnAutoNumber');
    btn.disabled = true;
    btn.textContent = '编号中...';

    try {
        const res = await fetch(`${API_BASE}/api/students/auto-number`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operator_name: currentUser.name,
                operator_role: currentUser.role
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast('✓ ' + result.message, 'success');
            loadStudents();
        } else {
            showToast('编号失败：' + result.message, 'error');
        }
    } catch (e) {
        showToast('网络错误，请重试', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '一键编号';
    }
}

// ============================================================
// 一键清空学生数据（仅超级管理员）
// ============================================================
function showClearAllModal() {
    document.getElementById('clearAllConfirmInput').value = '';
    document.getElementById('clearAllError').textContent = '';
    document.getElementById('clearAllModal').style.display = 'flex';
}

function closeClearAllModal() {
    document.getElementById('clearAllModal').style.display = 'none';
}

async function confirmClearAll() {
    const input = document.getElementById('clearAllConfirmInput').value.trim();
    const errEl = document.getElementById('clearAllError');
    if (input !== '确认清空') {
        errEl.textContent = '输入内容不正确，请输入《确认清空》';
        return;
    }
    errEl.textContent = '';
    try {
        const res = await fetch(
            `${API_BASE}/api/students/clear-all?operator_name=${encodeURIComponent(currentUser.name)}&operator_role=${currentUser.role}&confirm=yes`,
            { method: 'DELETE' }
        );
        const result = await res.json();
        if (result.success) {
            closeClearAllModal();
            showToast(result.message || '清空成功', 'success');
            loadStudents();
        } else {
            errEl.textContent = result.message || '清空失败';
        }
    } catch (e) {
        errEl.textContent = '网络错误，请重试';
    }
}

// ============================================================
// 数据统计
// ============================================================
async function loadStatistics() {
    try {
        const res = await fetch(`${API_BASE}/api/statistics`);
        const data = await res.json();
        document.getElementById('statTotal').textContent = data.total;
        document.getElementById('statSigned').textContent = data.signed;
        document.getElementById('statUnsigned').textContent = data.unsigned;
        document.getElementById('statRate').textContent = data.sign_rate + '%';
        renderTrendChart(data.daily_trend);
        renderBarChart('districtChart', data.by_district.map(d => ({ label: d.district, value: d.count })));
        renderBarChart('teacherChart', data.by_teacher.map(t => ({ label: t.teacher, value: t.total, extra: `已签 ${t.signed}` })));
        renderBarChart('classChart', data.by_class.map(c => ({ label: c.class, value: c.count })));
        renderBarChart('schoolChart', data.by_school.map(s => ({ label: s.school, value: s.count })));
        const overviewData = [
            { label: '学生总数', value: data.total },
            { label: '已认定', value: data.signed },
            { label: '未认定', value: data.unsigned },
            { label: '试卷数量', value: data.paper_total }
        ];
        renderBarChart('overviewChart', overviewData, 'green');
    } catch (e) {
        console.error('加载统计数据失败', e);
    }
}

function renderTrendChart(trend) {
    const container = document.getElementById('trendChart');
    if (!trend || trend.length === 0) {
        container.innerHTML = '<div style="color:#aaa;font-size:13px;padding:20px 0;">暂无数据</div>';
        return;
    }
    const maxVal = Math.max(...trend.map(d => d.count), 1);
    container.innerHTML = trend.map(d => {
        const pct = Math.round((d.count / maxVal) * 100);
        const label = d.day ? d.day.slice(5) : '';
        return `<div class="trend-bar-wrap">
            <div class="trend-bar-num">${d.count}</div>
            <div class="trend-bar" style="height:${Math.max(pct, 4)}%"></div>
            <div class="trend-bar-label">${label}</div>
        </div>`;
    }).join('');
}

function renderBarChart(containerId, items, colorClass = '') {
    const container = document.getElementById(containerId);
    if (!items || items.length === 0) {
        container.innerHTML = '<li style="color:#aaa;font-size:13px;padding:10px 0;">暂无数据</li>';
        return;
    }
    const maxVal = Math.max(...items.map(i => i.value), 1);
    container.innerHTML = items.map(item => {
        const pct = Math.round((item.value / maxVal) * 100);
        const extra = item.extra ? `<span style="color:#888;font-size:11px;margin-left:4px;">(${item.extra})</span>` : '';
        return `<li class="chart-bar-item">
            <span class="chart-bar-label" title="${item.label}">${item.label}</span>
            <div class="chart-bar-track"><div class="chart-bar-fill ${colorClass}" style="width:${pct}%"></div></div>
            <span class="chart-bar-val">${item.value}${extra}</span>
        </li>`;
    }).join('');
}

// ============================================================
// 操作日志
// ============================================================
async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">加载中...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/api/logs`);
        const logs = await res.json();
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">暂无日志</td></tr>';
            return;
        }
        tbody.innerHTML = logs.map((log, idx) => {
            const badgeClass = getLogBadgeClass(log.action);
            return `<tr>
                <td>${idx + 1}</td>
                <td>${log.operator || ''}</td>
                <td><span class="log-action-badge ${badgeClass}">${log.action}</span></td>
                <td>${log.target || ''}</td>
                <td>${log.detail || ''}</td>
                <td>${log.log_time || ''}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#dc3545;padding:20px;">加载失败，请刷新重试</td></tr>';
    }
}

function getLogBadgeClass(action) {
    if (!action) return 'default';
    if (action.includes('登录')) return 'login';
    if (action.includes('新增') || action.includes('添加') || action.includes('上传')) return 'add';
    if (action.includes('编辑') || action.includes('修改') || action.includes('密码')) return 'edit';
    if (action.includes('删除')) return 'delete';
    if (action.includes('认定')) return 'sign';
    return 'default';
}

// ============================================================
// 学生管理 —— 后端分页
// ============================================================

// 分页状态
let currentPage = 1;
let currentPageSize = 20;
let totalStudents = 0;

async function loadStudents(resetPage) {
    if (resetPage) currentPage = 1;
    try {
        const params = new URLSearchParams({
            page: currentPage,
            page_size: currentPageSize
        });
        if (currentUser && currentUser.role === 'teacher') {
            params.set('role', currentUser.role);
            params.set('username', currentUser.username || '');
            params.set('name', currentUser.name || '');
        }
        // 带入当前筛选条件
        const keyword = (document.getElementById('searchInput')?.value || '').trim();
        const signed   = document.getElementById('filterSigned')?.value || '';
        const district = document.getElementById('filterDistrict')?.value || '';
        const teacher  = document.getElementById('filterTeacher')?.value || '';
        const cls      = document.getElementById('filterClass')?.value || '';
        if (keyword)  params.set('keyword', keyword);
        if (signed !== '') params.set('is_signed', signed);
        if (district) params.set('district', district);
        if (teacher)  params.set('teacher', teacher);
        if (cls)      params.set('promised_class', cls);

        const res = await fetch(`${API_BASE}/api/students?${params.toString()}`);
        const json = await res.json();
        allStudents = json.data || [];
        totalStudents = json.total || 0;
        renderStudentTable(allStudents);
        renderPagination();
        // 首次加载时填充筛选下拉（需要全量数据，单独请求）
        if (resetPage || currentPage === 1) {
            populateFilterOptionsFromServer();
        }
    } catch (e) {
        console.error('加载学生数据失败', e);
    }
}

// 从服务器获取全量去重选项（用于筛选下拉）
async function populateFilterOptionsFromServer() {
    try {
        const params = new URLSearchParams({ page: 1, page_size: 9999 });
        if (currentUser && currentUser.role === 'teacher') {
            params.set('role', currentUser.role);
            params.set('username', currentUser.username || '');
            params.set('name', currentUser.name || '');
        }
        const res = await fetch(`${API_BASE}/api/students?${params.toString()}`);
        const json = await res.json();
        populateFilterOptions(json.data || []);
    } catch (e) {}
}

// 渲染分页控件
function renderPagination() {
    const container = document.getElementById('paginationContainer');
    if (!container) return;
    const totalPages = Math.ceil(totalStudents / currentPageSize) || 1;
    const start = totalStudents === 0 ? 0 : (currentPage - 1) * currentPageSize + 1;
    const end   = Math.min(currentPage * currentPageSize, totalStudents);

    container.innerHTML = `
        <div class="pagination-info">共 <strong>${totalStudents}</strong> 条，当前显示 ${start}-${end} 条</div>
        <div class="pagination-controls">
            <div class="page-size-btns">
                每页
                ${[10, 20, 50].map(n => `<button class="page-size-btn${currentPageSize === n ? ' active' : ''}" onclick="changePageSize(${n})">${n}</button>`).join('')}
                条
            </div>
            <div class="page-nav">
                <button class="page-btn" onclick="goPage(1)" ${currentPage === 1 ? 'disabled' : ''}>首页</button>
                <button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
                <span class="page-indicator">${currentPage} / ${totalPages}</span>
                <button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
                <button class="page-btn" onclick="goPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>末页</button>
                <span class="page-jump">跳转 <input type="number" id="pageJumpInput" min="1" max="${totalPages}" value="${currentPage}" onkeydown="if(event.key==='Enter')jumpToPage()"> 页 <button class="page-btn page-jump-btn" onclick="jumpToPage()">跳转</button></span>
            </div>
        </div>
    `;
}

function goPage(p) {
    const totalPages = Math.ceil(totalStudents / currentPageSize) || 1;
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    loadStudents(false);
}

function changePageSize(size) {
    currentPageSize = size;
    currentPage = 1;
    loadStudents(false);
}

function jumpToPage() {
    const input = document.getElementById('pageJumpInput');
    if (!input) return;
    const p = parseInt(input.value);
    const totalPages = Math.ceil(totalStudents / currentPageSize) || 1;
    if (p >= 1 && p <= totalPages) goPage(p);
}

// 动态填充筛选下拉选项
function populateFilterOptions(students) {
    const districts = [...new Set(students.map(s => s.district).filter(Boolean))].sort();
    const teachers  = [...new Set(students.map(s => s.assigned_teacher || s.teacher).filter(Boolean))].sort();
    const classes   = [...new Set(students.map(s => s.promised_class).filter(Boolean))].sort();

    function fillSelect(id, values) {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">全部</option>';
        values.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v; opt.textContent = v;
            sel.appendChild(opt);
        });
        if (cur) sel.value = cur;
    }
    fillSelect('filterDistrict', districts);
    fillSelect('filterTeacher', teachers);
    fillSelect('filterClass', classes);
}

// 切换高级筛选展开/折叠
function toggleAdvancedFilter() {
    const adv = document.getElementById('filterAdvanced');
    const btn = document.getElementById('filterToggleBtn');
    const arrow = document.getElementById('filterToggleArrow');
    const text = document.getElementById('filterToggleText');
    const isOpen = adv.style.display !== 'none';
    adv.style.display = isOpen ? 'none' : 'block';
    arrow.classList.toggle('open', !isOpen);
    btn.classList.toggle('active', !isOpen);
    text.textContent = isOpen ? '高级筛选' : '收起筛选';
}

// 更新筛选激活标签
function updateFilterActiveTag() {
    const signed   = document.getElementById('filterSigned')?.value || '';
    const district = document.getElementById('filterDistrict')?.value || '';
    const teacher  = document.getElementById('filterTeacher')?.value || '';
    const cls      = document.getElementById('filterClass')?.value || '';
    const count = [signed, district, teacher, cls].filter(Boolean).length;
    const tag = document.getElementById('filterActiveTag');
    if (!tag) return;
    if (count > 0) {
        tag.style.display = 'inline-flex';
        tag.textContent = `已筛选 ${count} 项`;
    } else {
        tag.style.display = 'none';
    }
}

// ============================================================
// 学生列表渲染 —— 严格按模板26列 + 登记时间 + 操作
// 列顺序：序号 | 学生姓名 | 性别 | 联系电话1 | 联系电话2 | 行政区 |
//         初中学校名称 | 承诺班型 | 认定编号 | 负责老师 | 备注 |
//         毕业年份 | 班级 | 年级总人数 |
//         八上期末年级排名 | 八下期末年级排名 | 九上期中年级排名 | 九上期末排名 |
//         九上期末分数 | 一模成绩 | 二模成绩 |
//         测试试卷 | 测试地点 | 数学 | 英语 | 总分 | 评价等级 |
//         成绩文件 | 登记时间 | 操作
// ============================================================
function renderStudentTable(students) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="30" style="text-align:center;color:#999;padding:30px;">暂无数据</td></tr>';
        return;
    }

    const truncate = (text, maxLen = 20) => {
        if (!text) return '';
        const str = String(text);
        if (str.length > maxLen) return `<span title="${str}">${str.substring(0, maxLen)}...</span>`;
        return str;
    };

    students.forEach((s, idx) => {
        const tr = document.createElement('tr');
        const recognitionNo = s.recognition_no || '';
        const isSignedBadge = recognitionNo
            ? `<span class="badge badge-success">已认定</span>`
            : (s.is_signed ? `<span class="badge badge-success">已认定</span>` : `<span class="badge badge-secondary">未认定</span>`);
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${s.name || ''}</td>
            <td>${s.gender || ''}</td>
            <td>${s.phone1 || ''}</td>
            <td>${s.phone2 || ''}</td>
            <td>${s.district || ''}</td>
            <td>${truncate(s.school, 25)}</td>
            <td>${s.promised_class || ''}</td>
            <td>${recognitionNo ? `<span class="badge badge-success">${recognitionNo}</span>` : isSignedBadge}</td>
            <td>${s.assigned_teacher || s.teacher || ''}</td>
            <td>${truncate(s.remark, 18)}</td>
            <td>${s.graduation_year || ''}</td>
            <td>${s.class_name || ''}</td>
            <td>${s.grade_total || ''}</td>
            <td>${s['rank_初一上'] || ''}</td>
            <td>${s['rank_初一下'] || ''}</td>
            <td>${s['rank_初二上'] || ''}</td>
            <td>${s['rank_初二下'] || ''}</td>
            <td>${s['score_初三上期末'] || ''}</td>
            <td>${s['score_一模'] || ''}</td>
            <td>${s['score_二模'] || ''}</td>
            <td>${s.test_paper || ''}</td>
            <td>${s.test_location || ''}</td>
            <td>${s.math_score || ''}</td>
            <td>${s.english_score || ''}</td>
            <td>${s.total_score || ''}</td>
            <td>${s.evaluation || ''}</td>
            <td>${s.file_path ? `<button class="btn-table btn-view-file" onclick="viewScoreFile('${s.file_path}')">查看</button>` : '<span style="color:#ccc;font-size:12px;">无</span>'}</td>
            <td>${s.createTime || ''}</td>
            <td>
                ${canEditDelete(s) ? `<button class="btn-table btn-edit" onclick="editStudent(${s.id})">编辑</button>` : ''}
                ${canEditDelete(s) ? `<button class="btn-table btn-delete" onclick="deleteStudent(${s.id})">删除</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 高级筛选（客户端过滤）
function applyFilters() {
    updateFilterActiveTag();
    loadStudents(true); // 筛选时重置到第1页
}

function clearFilters() {
    const si = document.getElementById('searchInput');
    const fs = document.getElementById('filterSigned');
    const fd = document.getElementById('filterDistrict');
    const ft = document.getElementById('filterTeacher');
    const fc = document.getElementById('filterClass');
    if (si) si.value = '';
    if (fs) fs.value = '';
    if (fd) fd.value = '';
    if (ft) ft.value = '';
    if (fc) fc.value = '';
    updateFilterActiveTag();
    loadStudents(true); // 清空筛选时重置到第1页
}

// ============================================================
// 新增学生表单提交
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const addForm = document.getElementById('addStudentForm');
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const recognitionNo = document.getElementById('addRecognition_no').value.trim();
            const data = {
                name: document.getElementById('addStudentName').value,
                gender: document.getElementById('addGender').value,
                phone1: document.getElementById('addPhone1').value,
                phone2: document.getElementById('addPhone2').value,
                district: document.getElementById('addDistrict').value,
                school: document.getElementById('addSchool').value,
                graduation_year: document.getElementById('addGraduation_year').value || null,
                class_name: document.getElementById('addClass_name').value,
                grade_total: document.getElementById('addGrade_total').value || null,
                'rank_初一上': document.getElementById('addRank_八上').value || null,
                'rank_初一下': document.getElementById('addRank_八下').value || null,
                'rank_初二上': document.getElementById('addRank_九上期中').value || null,
                'rank_初二下': document.getElementById('addRank_九上期末').value || null,
                'score_初三上期末': document.getElementById('addScore_九上期末').value,
                'score_一模': document.getElementById('addScore_一模').value,
                'score_二模': document.getElementById('addScore_二模').value,
                test_paper: document.getElementById('addTest_paper').value,
                test_location: document.getElementById('addTest_location').value,
                math_score: document.getElementById('addMath_score').value,
                english_score: document.getElementById('addEnglish_score').value,
                total_score: document.getElementById('addTotal_score').value,
                evaluation: document.getElementById('addEvaluation').value,
                promised_class: document.getElementById('addPromised_class').value,
                recognition_no: recognitionNo,
                is_signed: recognitionNo ? 1 : 0,
                assigned_teacher: document.getElementById('addAssigned_teacher').value,
                remark: document.getElementById('addRemark').value,
                teacher: currentUser.name
            };
            const res = await fetch(`${API_BASE}/api/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showToast('学生信息添加成功！', 'success');
                switchToAdmin();
            } else {
                showToast('添加失败：' + result.message, 'error');
            }
        });
    }

    // 教师认定登记表单（简化版）
    const studentForm = document.getElementById('studentForm');
    if (studentForm) {
        studentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const district = document.getElementById('regDistrict').value;
            const promisedClass = document.getElementById('regPromisedClass').value;
            const reason = document.getElementById('regReason').value;
            const score = document.getElementById('regScore').value;
            if (!promisedClass) { showToast('请选择认定班型', 'error'); return; }
            if (!district) { showToast('请选择行政区', 'error'); return; }
            if (!reason) { showToast('请选择认定理由', 'error'); return; }
            if (!score) { showToast('请输入成绩', 'error'); return; }

            // 先上传成绩文件（如有）
            let filePath = '';
            const fileInput = document.getElementById('regScoreFile');
            if (fileInput && fileInput.files && fileInput.files[0]) {
                const fd = new FormData();
                fd.append('file', fileInput.files[0]);
                try {
                    const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd });
                    const uploadResult = await uploadRes.json();
                    if (uploadResult.success) {
                        filePath = uploadResult.file_path;
                    } else {
                        showToast('文件上传失败：' + uploadResult.message, 'error');
                        return;
                    }
                } catch (err) {
                    showToast('文件上传失败，请检查网络', 'error');
                    return;
                }
            }

            const data = {
                name: document.getElementById('studentName').value,
                phone1: document.getElementById('phone1').value,
                phone2: document.getElementById('phone2').value,
                district: district,
                school: document.getElementById('school').value,
                reason: reason,
                score: score,
                promised_class: promisedClass,
                is_certified: document.getElementById('regIsConfirmed').value === '是' ? 1 : 0,
                remark: document.getElementById('remark').value,
                teacher: currentUser.name,
                assigned_teacher: currentUser.name,
                file_path: filePath
            };
            const res = await fetch(`${API_BASE}/api/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                const certMsg = result.recognition_no
                    ? `学生认定登记成功！认定编号：${result.recognition_no}`
                    : '学生登记成功！';
                showToast(certMsg, 'success');
                studentForm.reset();
                setTimeout(() => {
                    switchToAdmin();
                }, 300);
            } else {
                showToast('登记失败：' + result.message, 'error');
            }
        });
    }

    // 编辑表单
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editId').value;
            const recognitionNo = document.getElementById('editRecognition_no').value.trim();

            // 处理文件上传：若选了新文件则上传，否则保留原有
            let filePath = document.getElementById('editFilePath') ? document.getElementById('editFilePath').value : '';
            const editFileInput = document.getElementById('editScoreFile');
            if (editFileInput && editFileInput.files && editFileInput.files[0]) {
                const fd = new FormData();
                fd.append('file', editFileInput.files[0]);
                try {
                    const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd });
                    const uploadResult = await uploadRes.json();
                    if (uploadResult.success) {
                        filePath = uploadResult.file_path;
                    } else {
                        showToast('文件上传失败：' + uploadResult.message, 'error');
                        return;
                    }
                } catch (err) {
                    showToast('文件上传失败，请检查网络', 'error');
                    return;
                }
            }

            const data = {
                name: document.getElementById('editStudentName').value,
                gender: document.getElementById('editGender').value,
                phone1: document.getElementById('editPhone1').value,
                phone2: document.getElementById('editPhone2').value,
                district: document.getElementById('editDistrict').value,
                school: document.getElementById('editSchool').value,
                graduation_year: document.getElementById('editGraduation_year').value || null,
                class_name: document.getElementById('editClass_name').value,
                grade_total: document.getElementById('editGrade_total').value || null,
                'rank_初一上': document.getElementById('editRank_八上').value || null,
                'rank_初一下': document.getElementById('editRank_八下').value || null,
                'rank_初二上': document.getElementById('editRank_九上期中').value || null,
                'rank_初二下': document.getElementById('editRank_九上期末').value || null,
                'score_初三上期末': document.getElementById('editScore_九上期末').value,
                'score_一模': document.getElementById('editScore_一模').value,
                'score_二模': document.getElementById('editScore_二模').value,
                test_paper: document.getElementById('editTest_paper').value,
                test_location: document.getElementById('editTest_location').value,
                math_score: document.getElementById('editMath_score').value,
                english_score: document.getElementById('editEnglish_score').value,
                total_score: document.getElementById('editTotal_score').value,
                evaluation: document.getElementById('editEvaluation').value,
                promised_class: document.getElementById('editPromised_class').value,
                recognition_no: recognitionNo,
                is_signed: recognitionNo ? 1 : 0,
                assigned_teacher: document.getElementById('editAssigned_teacher').value,
                remark: document.getElementById('editRemark').value,
                teacher: currentUser.name,
                file_path: filePath
            };
            const res = await fetch(`${API_BASE}/api/students/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showToast('学生信息修改成功！', 'success');
                switchToAdmin();
            } else {
                showToast('修改失败：' + result.message, 'error');
            }
        });
    }

    // 用户表单
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('userId').value;
            const data = {
                username: document.getElementById('userUsername').value,
                password: document.getElementById('userPassword').value,
                role: document.getElementById('userRole').value,
                name: document.getElementById('userName').value
            };
            let res;
            if (id) {
                res = await fetch(`${API_BASE}/api/users/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else {
                res = await fetch(`${API_BASE}/api/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }
            const result = await res.json();
            if (result.success) {
                showToast(id ? '用户修改成功！' : '用户添加成功！', 'success');
                hideUserForm();
                loadUsers();
            } else {
                showToast('操作失败：' + result.message, 'error');
            }
        });
    }

    // 试卷上传表单
    const uploadPaperForm = document.getElementById('uploadPaperForm');
    if (uploadPaperForm) {
        uploadPaperForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('paperFile');
            if (!fileInput.files[0]) { showToast('请选择试卷文件', 'error'); return; }
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            fd.append('title', document.getElementById('paperTitle').value);
            fd.append('year', document.getElementById('paperYear').value);
            fd.append('description', document.getElementById('paperDesc').value);
            fd.append('uploader', currentUser.name);
            fd.append('operator_role', currentUser.role);
            try {
                const res = await fetch(`${API_BASE}/api/exam-papers`, { method: 'POST', body: fd });
                const result = await res.json();
                if (result.success) {
                    showToast('试卷上传成功！', 'success');
                    uploadPaperForm.reset();
                    loadExamPapers();
                } else {
                    showToast('上传失败：' + result.message, 'error');
                }
            } catch (err) {
                showToast('上传失败，请检查网络', 'error');
            }
        });
    }

    // Enter键登录
    document.getElementById('password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') login();
    });

    restoreUserSession();
});

// ============================================================
// 编辑学生
// ============================================================
async function editStudent(id) {
    try {
        const res = await fetch(`${API_BASE}/api/students/${id}`);
        const s = await res.json();
        showPage('editPage');
        document.getElementById('currentUserEdit').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
        document.getElementById('editId').value = s.id;
        document.getElementById('editStudentName').value = s.name || '';
        document.getElementById('editGender').value = s.gender || '';
        document.getElementById('editPhone1').value = s.phone1 || '';
        document.getElementById('editPhone2').value = s.phone2 || '';
        document.getElementById('editDistrict').value = s.district || '';
        document.getElementById('editSchool').value = s.school || '';
        document.getElementById('editGraduation_year').value = s.graduation_year || '';
        document.getElementById('editClass_name').value = s.class_name || '';
        document.getElementById('editGrade_total').value = s.grade_total || '';
        document.getElementById('editRank_八上').value = s['rank_初一上'] || '';
        document.getElementById('editRank_八下').value = s['rank_初一下'] || '';
        document.getElementById('editRank_九上期中').value = s['rank_初二上'] || '';
        document.getElementById('editRank_九上期末').value = s['rank_初二下'] || '';
        document.getElementById('editScore_九上期末').value = s['score_初三上期末'] || '';
        document.getElementById('editScore_一模').value = s['score_一模'] || '';
        document.getElementById('editScore_二模').value = s['score_二模'] || '';
        document.getElementById('editTest_paper').value = s.test_paper || '';
        document.getElementById('editTest_location').value = s.test_location || '';
        document.getElementById('editMath_score').value = s.math_score || '';
        document.getElementById('editEnglish_score').value = s.english_score || '';
        document.getElementById('editTotal_score').value = s.total_score || '';
        document.getElementById('editEvaluation').value = s.evaluation || '';
        document.getElementById('editPromised_class').value = s.promised_class || '';
        document.getElementById('editRecognition_no').value = s.recognition_no || '';
        document.getElementById('editAssigned_teacher').value = s.assigned_teacher || s.teacher || '';
        document.getElementById('editRemark').value = s.remark || '';
        // 显示当前成绩文件状态
        const currentFileEl = document.getElementById('editCurrentFile');
        const currentFileLinkEl = document.getElementById('editCurrentFileLink');
        if (currentFileEl && currentFileLinkEl) {
            if (s.file_path) {
                currentFileEl.style.display = 'block';
                currentFileLinkEl.href = `/uploads/${s.file_path}`;
                const ext = s.file_path.split('.').pop().toLowerCase();
                currentFileLinkEl.textContent = ext === 'pdf' ? '查看当前PDF文件' : '查看当前图片';
            } else {
                currentFileEl.style.display = 'none';
            }
        }
        // 将当前 file_path 存入隐藏字段
        const editFilePathEl = document.getElementById('editFilePath');
        if (editFilePathEl) editFilePathEl.value = s.file_path || '';
        // 清空文件选择框
        const editScoreFileEl = document.getElementById('editScoreFile');
        if (editScoreFileEl) editScoreFileEl.value = '';
    } catch (e) {
        showToast('加载学生数据失败', 'error');
    }
}

async function deleteStudent(id) {
    if (!confirm('确定要删除该学生记录吗？此操作不可恢复！')) return;
    try {
        const params = new URLSearchParams({
            operator_name: currentUser.name,
            operator_role: currentUser.role
        });
        const res = await fetch(`${API_BASE}/api/students/${id}?${params}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            showToast('删除成功', 'success');
            loadStudents();
        } else {
            showToast('删除失败：' + result.message, 'error');
        }
    } catch (e) {
        showToast('网络错误', 'error');
    }
}

// ============================================================
// 用户管理
// ============================================================
async function loadUsers() {
    try {
        const res = await fetch(`${API_BASE}/api/users`);
        const users = await res.json();
        const tbody = document.getElementById('userTableBody');
        tbody.innerHTML = '';
        users.forEach((u, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td>${u.username}</td>
                <td>${roleLabel(u.role)}</td>
                <td>${u.name}</td>
                <td>
                    <button class="btn-table btn-edit" onclick="editUser(${u.id}, '${u.username}', '${u.role}', '${u.name}')">编辑</button>
                    <button class="btn-table btn-delete" onclick="deleteUser(${u.id})">删除</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('加载用户失败', e);
    }
}

function showAddUserForm() {
    document.getElementById('userFormTitle').textContent = '添加用户';
    document.getElementById('userId').value = '';
    document.getElementById('userUsername').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = '';
    document.getElementById('userName').value = '';
    document.getElementById('userFormCard').style.display = 'block';
}

function editUser(id, username, role, name) {
    document.getElementById('userFormTitle').textContent = '编辑用户';
    document.getElementById('userId').value = id;
    document.getElementById('userUsername').value = username;
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = role;
    document.getElementById('userName').value = name;
    document.getElementById('userFormCard').style.display = 'block';
}

function hideUserForm() {
    document.getElementById('userFormCard').style.display = 'none';
}

async function deleteUser(id) {
    if (!confirm('确定要删除该用户吗？')) return;
    try {
        const res = await fetch(`${API_BASE}/api/users/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            showToast('用户删除成功', 'success');
            loadUsers();
        } else {
            showToast('删除失败：' + result.message, 'error');
        }
    } catch (e) {
        showToast('网络错误', 'error');
    }
}

// ============================================================
// 导出 Excel —— 严格按模板26列输出
// ============================================================
function exportToExcel() {
    const headers = [
        '学生姓名','性别','联系电话1','联系电话2','行政区','初中学校名称','毕业年份','班级','年级总人数',
        '八上期末年级排名','八下期末年级排名','九上期中年级排名','九上期末排名',
        '九上期末分数','一模成绩','二模成绩',
        '测试试卷','测试地点','数学','英语','总分','评价等级','承诺班型',
        '认定编号','负责老师','备注'
    ];
    const rows = allStudents.map(s => [
        s.name, s.gender, s.phone1, s.phone2, s.district, s.school,
        s.graduation_year, s.class_name, s.grade_total,
        s['rank_初一上'], s['rank_初一下'], s['rank_初二上'], s['rank_初二下'],
        s['score_初三上期末'], s['score_一模'], s['score_二模'],
        s.test_paper, s.test_location, s.math_score, s.english_score, s.total_score,
        s.evaluation, s.promised_class,
        s.recognition_no || '', s.assigned_teacher || s.teacher || '', s.remark || ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '学生信息');
    XLSX.writeFile(wb, `学生信息_${new Date().toLocaleDateString()}.xlsx`);
}

// ============================================================
// 下载导入模板 —— 严格按用户提供模板的字段顺序
// 顺序：学生姓名|性别|联系电话1|联系电话2|行政区|初中学校名称|
//       承诺班型|认定编号|负责老师|备注|
//       毕业年份|班级|年级总人数|八上期末年级排名|八下期末年级排名|
//       九上期中年级排名|九上期末排名|九上期末分数|一模成绩|二模成绩|
//       测试试卷|测试地点|数学|英语|总分|评价等级
// ============================================================
function downloadExcelTemplate() {
    // 第一行：字段说明（填写提示）
    const tips = [
        '必填，学生真实姓名',
        '选填，男/女',
        '必填，11位手机号',
        '选填，备用手机号',
        '必填，如：拱墅区、西湖区',
        '必填，初中学校全称',
        '必填，如：冲刺班/提高班/基础班',
        '选填，有值则系统视为已认定（导入时编号由系统自动分配）',
        '选填，负责老师姓名或账号',
        '选填，其他备注信息',
        '选填，如：2025',
        '选填，如：905班',
        '选填，年级总人数（数字）',
        '选填，八上期末年级排名（数字）',
        '选填，八下期末年级排名（数字）',
        '选填，九上期中年级排名（数字）',
        '选填，九上期末年级排名（数字）',
        '选填，九上期末分数，如：580',
        '选填，一模成绩，如：590',
        '选填，二模成绩，如：595',
        '选填，测试试卷名称，如：A卷',
        '选填，测试地点，如：某校区',
        '选填，数学单科成绩',
        '选填，英语单科成绩',
        '选填，测试总分',
        '选填，评价等级，如：A/B/C'
    ];
    // 第二行：字段名（严格按用户模板顺序）
    const headers = [
        '学生姓名','性别','联系电话1','联系电话2','行政区','初中学校名称',
        '承诺班型','认定编号','负责老师','备注',
        '毕业年份','班级','年级总人数',
        '八上期末年级排名','八下期末年级排名','九上期中年级排名','九上期末排名',
        '九上期末分数','一模成绩','二模成绩',
        '测试试卷','测试地点','数学','英语','总分','评价等级'
    ];
    // 第三行：示例数据
    const example = [
        '张三','男','13800000001','13900000002','拱墅区','杭州大关实验中学',
        'A','','张老师','示例备注',
        '2025','905班','500',
        '12','9','7','6','580','590','595',
        'A卷','某校区','120','110','580','A'
    ];
    const ws = XLSX.utils.aoa_to_sheet([tips, headers, example]);
    // 设置列宽
    ws['!cols'] = headers.map((h, i) => ({
        wch: Math.max(h.length * 2.2, tips[i] ? tips[i].length * 1.5 : 12, 12)
    }));
    // 冻结前两行
    ws['!freeze'] = { xSplit: 0, ySplit: 2 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '学生信息导入模板');
    XLSX.writeFile(wb, '学生信息导入模板.xlsx');
}

// ============================================================
// Excel导入认定审核流程
// ============================================================
function resetSignPage() {
    signPreviewStudents = [];
    document.getElementById('signStep1').style.display = 'block';
    document.getElementById('signStep2').style.display = 'none';
    document.getElementById('signStep3').style.display = 'none';
    setSignStep(1);
    document.getElementById('excelFileInput').value = '';
    document.getElementById('uploadStatus').style.display = 'none';
    document.getElementById('uploadZone').classList.remove('dragover');
    const confirmBtn = document.getElementById('confirmSignBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认认定';
    }
}

function setSignStep(n) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`step${i}Indicator`);
        if (!el) continue;
        el.classList.remove('active', 'done');
        if (i < n) el.classList.add('done');
        else if (i === n) el.classList.add('active');
    }
}

function handleExcelDrop(event) {
    event.preventDefault();
    document.getElementById('uploadZone').classList.remove('dragover');
    const file = event.dataTransfer.files[0];
    if (file) processExcelFile(file);
}

function handleExcelUpload(input) {
    const file = input.files[0];
    if (file) processExcelFile(file);
}

async function processExcelFile(file) {
    const status = document.getElementById('uploadStatus');
    status.style.display = 'block';
    status.className = 'upload-status loading';
    status.textContent = '正在解析文件...';

    const fd = new FormData();
    fd.append('file', file);

    try {
        const res = await fetch(`${API_BASE}/api/preview-excel`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            signPreviewStudents = data.students;
            status.className = 'upload-status success';
            status.textContent = `✓ 解析成功，共读取 ${data.total} 条学生记录`;
            setTimeout(() => { showSignStep2(); }, 800);
        } else {
            status.className = 'upload-status error';
            status.textContent = '✗ 解析失败：' + data.message;
        }
    } catch (e) {
        status.className = 'upload-status error';
        status.textContent = '✗ 网络错误，请重试';
    }
}

function showSignStep2() {
    document.getElementById('signStep1').style.display = 'none';
    document.getElementById('signStep2').style.display = 'block';
    document.getElementById('signStep3').style.display = 'none';
    setSignStep(2);
    renderSignPreviewTable();
    document.getElementById('signSummary').textContent = `共 ${signPreviewStudents.length} 条记录`;
}

// ============================================================
// 导入预览表格渲染 —— 严格按模板26列
// ============================================================
function renderSignPreviewTable() {
    const tbody = document.getElementById('signPreviewBody');
    tbody.innerHTML = '';
    signPreviewStudents.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.idx = idx;
        const isCertified = s.is_certified === 1 || s.is_certified === '1';
        const certBadge = isCertified
            ? '<span class="badge badge-success">将认定（系统分配编号）</span>'
            : '<span class="badge badge-secondary">不认定</span>';
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><span class="cell-val">${s.name || ''}</span></td>
            <td><span class="cell-val">${s.gender || ''}</span></td>
            <td><span class="cell-val">${s.phone1 || ''}</span></td>
            <td><span class="cell-val">${s.phone2 || ''}</span></td>
            <td><span class="cell-val">${s.district || ''}</span></td>
            <td><span class="cell-val">${s.school || ''}</span></td>
            <td><span class="cell-val">${s.promised_class || ''}</span></td>
            <td>${certBadge}</td>
            <td><span class="cell-val">${s.assigned_teacher || s.teacher || ''}</span></td>
            <td><span class="cell-val">${s.remark || ''}</span></td>
            <td><span class="cell-val">${s.graduation_year || ''}</span></td>
            <td><span class="cell-val">${s.class_name || ''}</span></td>
            <td><span class="cell-val">${s.grade_total || ''}</span></td>
            <td><span class="cell-val">${s['rank_初一上'] || ''}</span></td>
            <td><span class="cell-val">${s['rank_初一下'] || ''}</span></td>
            <td><span class="cell-val">${s['rank_初二上'] || ''}</span></td>
            <td><span class="cell-val">${s['rank_初二下'] || ''}</span></td>
            <td><span class="cell-val">${s['score_初三上期末'] || ''}</span></td>
            <td><span class="cell-val">${s['score_一模'] || ''}</span></td>
            <td><span class="cell-val">${s['score_二模'] || ''}</span></td>
            <td><span class="cell-val">${s.test_paper || ''}</span></td>
            <td><span class="cell-val">${s.test_location || ''}</span></td>
            <td><span class="cell-val">${s.math_score || ''}</span></td>
            <td><span class="cell-val">${s.english_score || ''}</span></td>
            <td><span class="cell-val">${s.total_score || ''}</span></td>
            <td><span class="cell-val">${s.evaluation || ''}</span></td>
            <td>
                <button class="btn-table btn-edit" onclick="openSignEditModal(${idx})">编辑</button>
                <button class="btn-table btn-delete" onclick="removeSignRow(${idx})">移除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function removeSignRow(idx) {
    if (!confirm('确定移除该条记录吗？')) return;
    signPreviewStudents.splice(idx, 1);
    renderSignPreviewTable();
    document.getElementById('signSummary').textContent = `共 ${signPreviewStudents.length} 条记录`;
}

// ============================================================
// 导入预览编辑模态框 —— 严格按模板26列
// ============================================================
function openSignEditModal(idx) {
    const s = signPreviewStudents[idx];
    document.getElementById('signEditIndex').value = idx;
    document.getElementById('signEditName').value = s.name || '';
    document.getElementById('signEditGender').value = s.gender || '';
    document.getElementById('signEditPhone1').value = s.phone1 || '';
    document.getElementById('signEditPhone2').value = s.phone2 || '';
    document.getElementById('signEditDistrict').value = s.district || '';
    document.getElementById('signEditSchool').value = s.school || '';
    document.getElementById('signEditGradYear').value = s.graduation_year || '';
    document.getElementById('signEditClass').value = s.class_name || '';
    document.getElementById('signEditGradeTotal').value = s.grade_total || '';
    document.getElementById('signEditRank1a').value = s['rank_初一上'] || '';
    document.getElementById('signEditRank1b').value = s['rank_初一下'] || '';
    document.getElementById('signEditRank2a').value = s['rank_初二上'] || '';
    document.getElementById('signEditRank2b').value = s['rank_初二下'] || '';
    document.getElementById('signEditScore3end').value = s['score_初三上期末'] || '';
    document.getElementById('signEditScore1m').value = s['score_一模'] || '';
    document.getElementById('signEditScore2m').value = s['score_二模'] || '';
    document.getElementById('signEditTestPaper').value = s.test_paper || '';
    document.getElementById('signEditTestLoc').value = s.test_location || '';
    document.getElementById('signEditMath').value = s.math_score || '';
    document.getElementById('signEditEnglish').value = s.english_score || '';
    document.getElementById('signEditTotal').value = s.total_score || '';
    document.getElementById('signEditEval').value = s.evaluation || '';
    document.getElementById('signEditPromised').value = s.promised_class || '';
    // 是否认定：优先看is_certified，其次看is_signed
    const isCertVal = (s.is_certified === 1 || s.is_certified === '1' || s.is_signed === 1 || s.is_signed === '1') ? '1' : '0';
    document.getElementById('signEditIsCertified').value = isCertVal;
    document.getElementById('signEditRecognitionNo').value = '';
    document.getElementById('signEditTeacher').value = s.assigned_teacher || s.teacher || '';
    document.getElementById('signEditRemark').value = s.remark || '';
    document.getElementById('signEditModal').style.display = 'flex';
}

function closeSignEditModal(event) {
    if (event && event.target !== document.getElementById('signEditModal')) return;
    document.getElementById('signEditModal').style.display = 'none';
}

function saveSignEdit() {
    const idx = parseInt(document.getElementById('signEditIndex').value);
    const isCertified = parseInt(document.getElementById('signEditIsCertified').value);
    signPreviewStudents[idx] = {
        name: document.getElementById('signEditName').value,
        gender: document.getElementById('signEditGender').value,
        phone1: document.getElementById('signEditPhone1').value,
        phone2: document.getElementById('signEditPhone2').value,
        district: document.getElementById('signEditDistrict').value,
        school: document.getElementById('signEditSchool').value,
        graduation_year: document.getElementById('signEditGradYear').value || null,
        class_name: document.getElementById('signEditClass').value,
        grade_total: document.getElementById('signEditGradeTotal').value || null,
        'rank_初一上': document.getElementById('signEditRank1a').value || null,
        'rank_初一下': document.getElementById('signEditRank1b').value || null,
        'rank_初二上': document.getElementById('signEditRank2a').value || null,
        'rank_初二下': document.getElementById('signEditRank2b').value || null,
        'score_初三上期末': document.getElementById('signEditScore3end').value,
        'score_一模': document.getElementById('signEditScore1m').value,
        'score_二模': document.getElementById('signEditScore2m').value,
        test_paper: document.getElementById('signEditTestPaper').value,
        test_location: document.getElementById('signEditTestLoc').value,
        math_score: document.getElementById('signEditMath').value,
        english_score: document.getElementById('signEditEnglish').value,
        total_score: document.getElementById('signEditTotal').value,
        evaluation: document.getElementById('signEditEval').value,
        promised_class: document.getElementById('signEditPromised').value,
        is_certified: isCertified,  // 由系统在batch_sign时自动分配认定编号
        is_signed: 0,               // 入库前不设置
        recognition_no: '',         // 入库前不设置
        assigned_teacher: document.getElementById('signEditTeacher').value,
        teacher: document.getElementById('signEditTeacher').value,
        remark: document.getElementById('signEditRemark').value
    };
    document.getElementById('signEditModal').style.display = 'none';
    renderSignPreviewTable();
}

function proceedToConfirm() {
    if (signPreviewStudents.length === 0) {
        showToast('没有学生数据，请先上传Excel文件', 'error');
        return;
    }
    document.getElementById('signStep2').style.display = 'none';
    document.getElementById('signStep3').style.display = 'block';
    setSignStep(3);

    const signedCount = signPreviewStudents.filter(s => s.is_certified === 1 || s.is_certified === '1').length;
    const summary = document.getElementById('confirmSummary');
    summary.innerHTML = `
        <div class="confirm-stat">
            <div class="stat-item">
                <div class="stat-num">${signPreviewStudents.length}</div>
                <div class="stat-label">学生总数</div>
            </div>
            <div class="stat-item stat-signed">
                <div class="stat-num">${signedCount}</div>
                <div class="stat-label">已认定</div>
            </div>
            <div class="stat-item stat-unsigned">
                <div class="stat-num">${signPreviewStudents.length - signedCount}</div>
                <div class="stat-label">未认定</div>
            </div>
        </div>
        <p style="margin-top: 15px; color: #555;">操作人：<strong>${currentUser.name}</strong>　提交时间：<strong>${new Date().toLocaleString()}</strong></p>
    `;
}

function backToReview() {
    document.getElementById('signStep3').style.display = 'none';
    document.getElementById('signStep2').style.display = 'block';
    setSignStep(2);
}

async function confirmBatchSign() {
    const btn = document.getElementById('confirmSignBtn');
    btn.disabled = true;
    btn.textContent = '提交中...';
    try {
        const res = await fetch(`${API_BASE}/api/batch-sign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students: signPreviewStudents, teacher: currentUser.name })
        });
        const result = await res.json();
        if (result.success) {
            showToast('✓ ' + result.message, 'success');
            btn.disabled = false;
            btn.textContent = '确认认定';
            setTimeout(() => switchToAdmin(), 1200);
        } else {
            showToast('认定失败：' + result.message, 'error');
            btn.disabled = false;
            btn.textContent = '确认认定';
        }
    } catch (e) {
        showToast('网络错误，请重试', 'error');
        btn.disabled = false;
        btn.textContent = '确认认定';
    }
}

// ============================================================
// 试卷浏览
// ============================================================
async function loadExamPapers() {
    const container = document.getElementById('paperListContainer');
    container.innerHTML = '<div style="text-align:center;color:#999;padding:30px;">加载中...</div>';
    try {
        const res = await fetch(`${API_BASE}/api/exam-papers`);
        const papers = await res.json();
        if (papers.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">暂无试卷，请上传试卷文件</div>';
            return;
        }
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'paper-grid';
        papers.forEach(p => {
            const card = document.createElement('div');
            card.className = 'paper-card';
            const ext = p.file_path.split('.').pop().toLowerCase();
            const icon = ext === 'pdf' ? '📄' : '🖼️';
            card.innerHTML = `
                <div class="paper-icon">${icon}</div>
                <div class="paper-info">
                    <div class="paper-title">${p.title}</div>
                    ${p.year ? `<div class="paper-meta">年份：${p.year}</div>` : ''}
                    ${p.description ? `<div class="paper-meta">${p.description}</div>` : ''}
                    <div class="paper-meta">上传人：${p.uploader} &nbsp;|&nbsp; ${p.upload_time}</div>
                </div>
                <div class="paper-actions">
                    <button class="btn btn-primary" style="width:auto;padding:8px 18px;" onclick="previewPaper('${p.file_path}', '${p.title}')">预览</button>
                    ${currentUser && currentUser.role === 'admin' ? `<button class="btn btn-danger" style="width:auto;padding:8px 14px;" onclick="deletePaper(${p.id})">删除</button>` : ''}
                    <button class="btn btn-secondary" style="width:auto;padding:8px 14px;background:#17a2b8;border-color:#17a2b8;" onclick="downloadPaper('${p.file_path}', '${p.title}')">下载</button>
                </div>
            `;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    } catch (e) {
        container.innerHTML = '<div style="text-align:center;color:#dc3545;padding:30px;">加载失败，请刷新重试</div>';
    }
}

function previewPaper(filePath, title) {
    const ext = filePath.split('.').pop().toLowerCase();
    const url = `/uploads/${filePath}`;
    document.getElementById('pdfModalTitle').textContent = title;
    if (ext === 'pdf') {
        document.getElementById('pdfFrame').src = url;
    } else {
        document.getElementById('pdfFrame').src = '';
        document.getElementById('pdfFrame').srcdoc = `<img src="${url}" style="max-width:100%;display:block;margin:auto;">`;
    }
    document.getElementById('pdfModal').style.display = 'flex';
}

function closePdfModal(event) {
    if (event && event.target !== document.getElementById('pdfModal')) return;
    document.getElementById('pdfModal').style.display = 'none';
    document.getElementById('pdfFrame').src = '';
}

async function deletePaper(id) {
    if (!confirm('确定要删除该试卷吗？')) return;
    const params = new URLSearchParams({
        operator_role: currentUser.role,
        operator_name: currentUser.name
    });
    const res = await fetch(`${API_BASE}/api/exam-papers/${id}?${params}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
        showToast('试卷删除成功', 'success');
        loadExamPapers();
    } else {
        showToast('删除失败：' + result.message, 'error');
    }
}

function downloadPaper(filePath, title) {
    const url = `${API_BASE}/uploads/${filePath}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = title + '.' + filePath.split('.').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ============================================================
// 超级管理员一键导出所有学生信息（后端生成，按模板26列）
// ============================================================
async function exportAllStudents() {
    if (!currentUser || !['admin', 'manager', 'teacher'].includes(currentUser.role)) {
        showToast('权限不足', 'error');
        return;
    }
    const btn = document.getElementById('btnExportAll');
    if (btn) { btn.disabled = true; btn.textContent = '导出中...'; }
    try {
        const params = new URLSearchParams({
            role: currentUser.role,
            username: currentUser.username || '',
            name: currentUser.name || ''
        });
        const response = await fetch(`${API_BASE}/api/export-all-students?${params}`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({ message: '导出失败' }));
            showToast('导出失败：' + (err.message || response.statusText), 'error');
            return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
        a.href = url;
        a.download = `学生信息全量导出_${ts}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('导出成功！', 'success');
    } catch (e) {
        showToast('导出异常：' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '导出数据'; }
    }
}

// ============================================================
// 查看学生成绩文件（图片或PDF）
// ============================================================
function viewScoreFile(filePath) {
    if (!filePath) return;
    const ext = filePath.split('.').pop().toLowerCase();
    const url = `/uploads/${filePath}`;
    document.getElementById('pdfModalTitle').textContent = '成绩文件';
    if (ext === 'pdf') {
        document.getElementById('pdfFrame').src = url;
        document.getElementById('pdfFrame').srcdoc = '';
    } else {
        document.getElementById('pdfFrame').src = '';
        document.getElementById('pdfFrame').srcdoc = `<html><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${url}" style="max-width:100%;max-height:100vh;display:block;"></body></html>`;
    }
    document.getElementById('pdfModal').style.display = 'flex';
}
