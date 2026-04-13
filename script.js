// ============================================================
// 全局状态
// ============================================================
let currentUser = null;
let allStudents = [];
let signPreviewStudents = [];

const API_BASE = '';

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

function refreshActivePage() {
    const page = _currentActivePage;
    if (!page) return;
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

// (移动菜单关闭逻辑已合并到下方的document click监听器中)

// ============================================================
// 学校数据（来源：杭州初中学校Excel）
// ============================================================
const SCHOOL_DATA = {
  '上城区': ['建兰中学','采荷C学校','杭州中学','钱学森学校','开元中学','惠兴中学','江城中学','勇进C学校','杭州第十中学','清河C学校','澎扬中学','澎诚中学','钱江外国语C学校','采荷中学','钱江新城C学校','笕桥C中学','天杭C学校','景荷中学','丁荷中学','四季青中学','丁兰C中学','东城中学','东城C学校','东城第二C学校','夏衍初级中学','浙江省教育科学研究院附属C学校','丁蕙C中学','笕成中学','杭州天成教育集团','景芳中学','杭州第六中学'],
  '拱墅区': ['文澜中学+文澜C','星澜中学','育才中学','育才大城北学校','锦绣中学','启正中学','观成C学校','观成武林中学','大成岳家湾C学校','大成C学校','风华中学','春蕾中学','青春中学','朝晖中学','胜蓝中学','景成C学校','风帆中学','明珠C学校','安吉路C学校','安吉路教育集团新天地C学校','行知中学','上海世外学校','华东师范大学附属杭州学校','杭州北苑C中学','大关中学','大关C中学','拱宸中学','文晖中学','杭师大文晖C学校','启航中学','树兰中学','康桥中学','长阳中学','桃源中学'],
  '西湖区': ['公益中学','之江C中学','十三中教育集团(总校)','嘉绿苑中学','保俶塔C学校','保俶塔申花C学校','第十五中学教育集团(浙大附初)','第十五中学教育集团(崇德校区)','丰潭中学','景汇中学','周浦、袁浦中学(也称双浦)','西湖第一C学校','西溪中学','三墩中学','弘益中学','西子C学校','西溪C学校','杭州云谷学校','上泗中学','紫金港中学','翠苑中学','文华中学','文理中学','杭州仁和C学校','文溪中学','浙江工业大学附属C学校'],
  '滨江区': ['杭州二中白马湖学校','杭州湖畔学校','长河中学','江南C学校','闻涛中学','高新C学校','滨和中学','浦沿中学','滨兰C学校','滨兴学校','西兴中学','滨文中学','杭州竺可桢学校','启成学校','养正学校','文海C学校','文海C中学','文海启源中学','观澜中学','学正中学','下沙中学','C外国语学校','景苑中学','新湾中学','义蓬中学','金沙湖C学校']
};

// 所有学校（含"其他"）
const ALL_SCHOOLS = [...Object.values(SCHOOL_DATA).flat(), '其他'];

// ============================================================
// 学校 Autocomplete
// ============================================================
// prefix: 'reg' | 'add' | 'edit'
function onSchoolInput(prefix) {
    const inputId = prefix === 'reg' ? 'school' : (prefix + 'School');
    const dropdownId = prefix + 'SchoolDropdown';
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const keyword = input.value.trim();
    // 根据当前行政区过滤
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
    // 行政区变化时清空学校输入并重新过滤
    const inputId = prefix === 'reg' ? 'school' : (prefix + 'School');
    const input = document.getElementById(inputId);
    if (input) input.value = '';
    onSchoolInput(prefix);
}

// 点击其他地方关闭下拉 + 关闭移动菜单
document.addEventListener('click', function(e) {
    // 关闭学校autocomplete下拉
    document.querySelectorAll('.school-dropdown.show').forEach(dd => {
        if (!dd.closest('.school-autocomplete-wrap').contains(e.target)) {
            dd.classList.remove('show');
        }
    });
    // 关闭移动端汉堡菜单（点击header外部时）
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
        const res = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            showMainPage();
        } else {
            document.getElementById('loginError').textContent = data.message || '用户名或密码错误';
        }
    } catch (e) {
        document.getElementById('loginError').textContent = '网络错误，请稍后重试';
    }
}

function logout() {
    currentUser = null;
    stopAutoRefresh();
    showPage('loginPage');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginError').textContent = '';
}

function showMainPage() {
    // 所有角色登录后都进入学生管理页（adminPage）
    // teacher 登录后也直接进入学生管理，但只能看到自己的学生
    switchToAdmin();
}

// ============================================================
// 页面切换
// ============================================================
function showPage(pageId) {
    // 切换页面时关闭所有移动端菜单
    closeAllMobileMenus();
    document.querySelectorAll('.page').forEach(p => {
        p.style.display = 'none';
        p.style.visibility = 'hidden';
    });
    const el = document.getElementById(pageId);
    el.style.visibility = 'visible';
    el.style.display = (pageId === 'loginPage') ? 'flex' : 'block';
    // 数据一致性：跟踪当前活跃页面并启动自动刷新
    _currentActivePage = pageId;
    if (pageId === 'loginPage') {
        stopAutoRefresh();
    } else {
        startAutoRefresh();
    }
}

function switchToRegister() {
    showPage('registerPage');
    document.getElementById('currentUser').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    // 管理员及以上才显示“学生管理”按钮
    document.getElementById('adminBtn').style.display = (currentUser.role !== 'teacher') ? 'inline-block' : 'none';
}

function switchToAdmin() {
    showPage('adminPage');
    document.getElementById('currentUserAdmin').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    const isAdmin = currentUser.role === 'admin';
    const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';
    const isTeacher = currentUser.role === 'teacher';
    // 导航按钮权限
    document.getElementById('userManagementBtn').style.display = isAdmin ? 'inline-block' : 'none';
    document.getElementById('statsBtn').style.display = isManager ? 'inline-block' : 'none';
    document.getElementById('logsBtn').style.display = isAdmin ? 'inline-block' : 'none';
    // 右上角"新增认定"按钮：管理员、超级管理员、认定老师均可见
    const navSignBtn = document.getElementById('navSignBtn');
    if (navSignBtn) navSignBtn.style.display = (isManager || isTeacher) ? 'inline-block' : 'none';
    // 工具栏按钮权限：认定老师也可以新增学生和新增认定
    const adminToolbar = document.getElementById('adminToolbar');
    if (adminToolbar) {
        const btnNewStudent = document.getElementById('btnNewStudent');
        const btnImportSign = document.getElementById('btnImportSign');
        const btnExport = document.getElementById('btnExport');
        const btnTemplate = document.getElementById('btnTemplate');
        if (btnNewStudent) btnNewStudent.style.display = 'inline-block';
        if (btnImportSign) btnImportSign.style.display = isTeacher ? 'none' : 'inline-block';
        if (btnExport) btnExport.style.display = 'inline-block';
        if (btnTemplate) btnTemplate.style.display = 'inline-block';
    }
    loadStudents();
}

function switchToAddStudent() {
    showPage('addStudentPage');
    document.getElementById('currentUserAddStudent').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    document.getElementById('addStudentForm').reset();
}

function switchToUserManagement() {
    showPage('userManagementPage');
    document.getElementById('currentUserUserManagement').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    loadUsers();
}

function switchToSignContract() {
    showPage('signContractPage');
    document.getElementById('currentUserSign').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    resetSignPage();
}

function switchToExamPapers() {
    showPage('examPapersPage');
    document.getElementById('currentUserExam').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    // 试卷上传仅超级管理员（admin）可见
    const canUpload = currentUser && currentUser.role === 'admin';
    document.getElementById('uploadPaperCard').style.display = canUpload ? 'block' : 'none';
    loadExamPapers();
}

function backFromExamPapers() {
    // 所有角色返回学生管理页
    switchToAdmin();
}

async function switchToStats() {
    showPage('statsPage');
    document.getElementById('currentUserStats').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    loadStatistics();
}

async function switchToLogs() {
    showPage('logsPage');
    document.getElementById('currentUserLogs').textContent = `${currentUser.name}（${roleLabel(currentUser.role)}）`;
    loadLogs();
}

function roleLabel(role) {
    const map = { admin: '超级管理员', manager: '管理员', teacher: '认定老师' };
    return map[role] || role;
}

/**
 * 判断当前用户是否可以编辑/删除某个学生
 * - 超级管理员和管理员：可操作所有学生
 * - 认定老师：只能操作自己登记的学生
 */
function canEditDelete(student) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return true;
    if (currentUser.role === 'teacher') return student.teacher === currentUser.name;
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

    if (!oldPwd || !newPwd || !confirmPwd) {
        errEl.textContent = '请填写所有密码字段';
        return;
    }
    if (newPwd.length < 6) {
        errEl.textContent = '新密码至少需要6位';
        return;
    }
    if (newPwd !== confirmPwd) {
        errEl.textContent = '两次输入的新密码不一致';
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/users/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                old_password: oldPwd,
                new_password: newPwd
            })
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
// 数据统计
// ============================================================
async function loadStatistics() {
    try {
        const res = await fetch(`${API_BASE}/api/statistics`);
        const data = await res.json();

        // 概览卡片
        document.getElementById('statTotal').textContent = data.total;
        document.getElementById('statSigned').textContent = data.signed;
        document.getElementById('statUnsigned').textContent = data.unsigned;
        document.getElementById('statRate').textContent = data.sign_rate + '%';

        // 近7天趋势
        renderTrendChart(data.daily_trend);

        // 各行政区
        renderBarChart('districtChart', data.by_district.map(d => ({ label: d.district, value: d.count })));

        // 各老师认定
        renderBarChart('teacherChart', data.by_teacher.map(t => ({
            label: t.teacher,
            value: t.total,
            extra: `已签 ${t.signed}`
        })));

        // 承诺班型
        renderBarChart('classChart', data.by_class.map(c => ({ label: c.class, value: c.count })));

        // 来源学校
        renderBarChart('schoolChart', data.by_school.map(s => ({ label: s.school, value: s.count })));

        // 系统概况
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
        const label = d.day ? d.day.slice(5) : ''; // 显示 MM-DD
        return `
            <div class="trend-bar-wrap">
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
        return `
            <li class="chart-bar-item">
                <span class="chart-bar-label" title="${item.label}">${item.label}</span>
                <div class="chart-bar-track">
                    <div class="chart-bar-fill ${colorClass}" style="width:${pct}%"></div>
                </div>
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
// 学生管理
// ============================================================
async function loadStudents() {
    try {
        // teacher 角色只加载自己登记的学生
        let url = `${API_BASE}/api/students`;
        if (currentUser && currentUser.role === 'teacher') {
            url += `?teacher=${encodeURIComponent(currentUser.name)}`;
        }
        const res = await fetch(url);
        allStudents = await res.json();
        renderStudentTable(allStudents);
        populateFilterOptions(allStudents);
    } catch (e) {
        console.error('加载学生数据失败', e);
    }
}

// 动态填充筛选下拉选项
function populateFilterOptions(students) {
    const districts = [...new Set(students.map(s => s.district).filter(Boolean))].sort();
    const teachers  = [...new Set(students.map(s => s.teacher).filter(Boolean))].sort();
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

function renderStudentTable(students) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="32" style="text-align:center;color:#999;padding:30px;">暂无数据</td></tr>';
        return;
    }
	    students.forEach((s, idx) => {
	        const tr = document.createElement('tr');
	        tr.innerHTML = `
	            <td>${idx + 1}</td>
	            <td>${s.name || ''}</td>
	            <td>${s.gender || ''}</td>
	            <td>${s.phone1 || ''}</td>
	            <td>${s.phone2 || ''}</td>
	            <td>${s.district || ''}</td>
	            <td>${s.school || ''}</td>
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
	            <td>${s.promised_class || ''}</td>
	            <td><span class="badge ${s.is_signed ? 'badge-success' : 'badge-secondary'}">${s.is_signed ? '是' : '否'}</span></td>
	            <td>${s.file_path ? `<a href="${API_BASE}/uploads/${s.file_path}" target="_blank" class="file-link">查看</a>` : '无'}</td>
	            <td>${s.remark || ''}</td>
	            <td>${s.teacher || ''}</td>
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
    const keyword  = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const signed   = document.getElementById('filterSigned')?.value || '';
    const district = document.getElementById('filterDistrict')?.value || '';
    const teacher  = document.getElementById('filterTeacher')?.value || '';
    const cls      = document.getElementById('filterClass')?.value || '';

    const filtered = allStudents.filter(s => {
        if (keyword && !(
            (s.name || '').toLowerCase().includes(keyword) ||
            (s.school || '').toLowerCase().includes(keyword) ||
            (s.phone1 || '').includes(keyword)
        )) return false;
        if (signed !== '' && String(s.is_signed) !== signed) return false;
        if (district && (s.district || '') !== district) return false;
        if (teacher  && (s.teacher  || '') !== teacher)  return false;
        if (cls      && (s.promised_class || '') !== cls) return false;
        return true;
    });
    updateFilterActiveTag();
    renderStudentTable(filtered);
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
    renderStudentTable(allStudents);
}

// 新增学生表单提交
document.addEventListener('DOMContentLoaded', () => {
    const addForm = document.getElementById('addStudentForm');
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('addFile');
            let filePath = '';
            if (fileInput.files[0]) {
                const fd = new FormData();
                fd.append('file', fileInput.files[0]);
                const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd });
                const uploadData = await uploadRes.json();
                if (uploadData.success) filePath = uploadData.file_path;
            }
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
                'rank_初一上': document.getElementById('addRank_初二上').value || null,
                'rank_初一下': document.getElementById('addRank_初二下').value || null,
                'rank_初二上': document.getElementById('addRank_初三上期中').value || null,
                'rank_初二下': document.getElementById('addRank_初三上期末').value || null,
                'score_初三上期末': document.getElementById('addScore_初三上期末').value,
                'score_一模': document.getElementById('addScore_一模').value,
                'score_二模': document.getElementById('addScore_二模').value,
                test_paper: document.getElementById('addTest_paper').value,
                test_location: document.getElementById('addTest_location').value,
                math_score: document.getElementById('addMath_score').value,
                english_score: document.getElementById('addEnglish_score').value,
                total_score: document.getElementById('addTotal_score').value,
                evaluation: document.getElementById('addEvaluation').value,
                promised_class: document.getElementById('addPromised_class').value,
                is_signed: parseInt(document.getElementById('addIs_signed').value),
                reason: document.getElementById('addReason').value,
                score: document.getElementById('addScore').value,
                file_path: filePath,
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

    // 教师登记表单
    const studentForm = document.getElementById('studentForm');
    if (studentForm) {
        studentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('file');
            let filePath = '';
            if (fileInput.files[0]) {
                const fd = new FormData();
                fd.append('file', fileInput.files[0]);
                const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd });
                const uploadData = await uploadRes.json();
                if (uploadData.success) filePath = uploadData.file_path;
            }
            // 前端验证新增必填字段
            const promisedClass = document.getElementById('regPromisedClass').value;
            const isSigned = document.getElementById('regIsSigned').value;
            if (!promisedClass) {
                showToast('请选择认定班型', 'error');
                return;
            }
            const data = {
                name: document.getElementById('studentName').value,
                school: document.getElementById('school').value,
                district: document.getElementById('regDistrict') ? document.getElementById('regDistrict').value : '',
                phone1: document.getElementById('phone1').value,
                reason: document.getElementById('reason').value,
                score: document.getElementById('score').value,
                promised_class: promisedClass,
                is_signed: parseInt(isSigned),
                file_path: filePath,
                remark: document.getElementById('remark').value,
                teacher: currentUser.name
            };
            const res = await fetch(`${API_BASE}/api/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                showToast('学生认定登记成功！', 'success');
                studentForm.reset();
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
            const fileInput = document.getElementById('editFile');
            let filePath = document.getElementById('currentFile').dataset.path || '';
            if (fileInput.files[0]) {
                const fd = new FormData();
                fd.append('file', fileInput.files[0]);
                const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd });
                const uploadData = await uploadRes.json();
                if (uploadData.success) filePath = uploadData.file_path;
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
                'rank_初一上': document.getElementById('editRank_初二上').value || null,
                'rank_初一下': document.getElementById('editRank_初二下').value || null,
                'rank_初二上': document.getElementById('editRank_初三上期中').value || null,
                'rank_初二下': document.getElementById('editRank_初三上期末').value || null,
                'score_初三上期末': document.getElementById('editScore_初三上期末').value,
                'score_一模': document.getElementById('editScore_一模').value,
                'score_二模': document.getElementById('editScore_二模').value,
                test_paper: document.getElementById('editTest_paper').value,
                test_location: document.getElementById('editTest_location').value,
                math_score: document.getElementById('editMath_score').value,
                english_score: document.getElementById('editEnglish_score').value,
                total_score: document.getElementById('editTotal_score').value,
                evaluation: document.getElementById('editEvaluation').value,
                promised_class: document.getElementById('editPromised_class').value,
                is_signed: parseInt(document.getElementById('editIs_signed').value),
                reason: document.getElementById('editReason').value,
                score: document.getElementById('editScore').value,
                file_path: filePath,
                remark: document.getElementById('editRemark').value,
                teacher: currentUser.name
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
                showToast('操作失败：' + result.
message, 'error');
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
        document.getElementById('editRank_初二上').value = s['rank_初一上'] || '';
        document.getElementById('editRank_初二下').value = s['rank_初一下'] || '';
        document.getElementById('editRank_初三上期中').value = s['rank_初二上'] || '';
        document.getElementById('editRank_初三上期末').value = s['rank_初二下'] || '';
        document.getElementById('editScore_初三上期末').value = s['score_初三上期末'] || '';
        document.getElementById('editScore_一模').value = s['score_一模'] || '';
        document.getElementById('editScore_二模').value = s['score_二模'] || '';
        document.getElementById('editTest_paper').value = s.test_paper || '';
        document.getElementById('editTest_location').value = s.test_location || '';
        document.getElementById('editMath_score').value = s.math_score || '';
        document.getElementById('editEnglish_score').value = s.english_score || '';
        document.getElementById('editTotal_score').value = s.total_score || '';
        document.getElementById('editEvaluation').value = s.evaluation || '';
        document.getElementById('editPromised_class').value = s.promised_class || '';
        document.getElementById('editIs_signed').value = s.is_signed || 0;
        document.getElementById('editReason').value = s.reason || '';
        document.getElementById('editScore').value = s.score || '';
        document.getElementById('editRemark').value = s.remark || '';
        const cf = document.getElementById('currentFile');
        cf.dataset.path = s.file_path || '';
        cf.textContent = s.file_path ? `当前文件：${s.file_path}` : '（无文件）';
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
// 导出 Excel
// ============================================================
function exportToExcel() {
    const headers = ['学生姓名','性别','联系电话1','联系电话2','行政区','初中学校名称','毕业年份','班级','年级总人数',
        '八上期末年级排名','八下期末年级排名','九上期中年级排名','九上期末排名','九上期末分数','一模成绩','二模成绩',
        '测试试卷','测试地点','数学','英语','总分','评价等级','承诺班型','是否已签约','备注','负责老师','登记时间'];
    const rows = allStudents.map(s => [
        s.name, s.gender, s.phone1, s.phone2, s.district, s.school, s.graduation_year, s.class_name, s.grade_total,
        s['rank_初一上'], s['rank_初一下'], s['rank_初二上'], s['rank_初二下'], s['score_初三上期末'], s['score_一模'], s['score_二模'],
        s.test_paper, s.test_location, s.math_score, s.english_score, s.total_score, s.evaluation, s.promised_class,
        s.is_signed ? '是' : '否', s.remark, s.teacher, s.createTime
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '学生信息');
    XLSX.writeFile(wb, `学生信息_${new Date().toLocaleDateString()}.xlsx`);
}

function downloadExcelTemplate() {
    const headers = ['学生姓名','性别','联系电话1','联系电话2','行政区','初中学校名称','毕业年份','班级','年级总人数',
        '八上期末年级排名','八下期末年级排名','九上期中年级排名','九上期末排名','九上期末分数','一模成绩','二模成绩',
        '测试试卷','测试地点','数学','英语','总分','评价等级','承诺班型','是否已签约','负责老师'];
    const example = ['张三','男','13800000001','13900000002','滨江区','某中学','2026','905','500',
        '12','9','7','6','560','580','590','A卷','某园区','120','110','580','A','B',
        '是','1234'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '学生信息模板');
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

function renderSignPreviewTable() {
    const tbody = document.getElementById('signPreviewBody');
    tbody.innerHTML = '';
    signPreviewStudents.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.idx = idx;
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><span class="cell-val">${s.name || ''}</span></td>
            <td><span class="cell-val">${s.gender || ''}</span></td>
            <td><span class="cell-val">${s.phone1 || ''}</span></td>
            <td><span class="cell-val">${s.phone2 || ''}</span></td>
            <td><span class="cell-val">${s.district || ''}</span></td>
            <td><span class="cell-val">${s.school || ''}</span></td>
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
            <td><span class="cell-val">${s.promised_class || ''}</span></td>
            <td><span class="badge ${s.is_signed ? 'badge-success' : 'badge-secondary'}">${s.is_signed ? '是' : '否'}</span></td>
            <td><span class="cell-val">${s.reason || ''}</span></td>
            <td><span class="cell-val">${s.remark || ''}</span></td>
            <td><span class="cell-val">${s.teacher || ''}</span></td>
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
    document.getElementById('signEditIsSigned').value = s.is_signed || 0;
    document.getElementById('signEditReason').value = s.reason || '';
    document.getElementById('signEditTeacher').value = s.teacher || '';
    document.getElementById('signEditRemark').value = s.remark || '';
    document.getElementById('signEditModal').style.display = 'flex';
}

function closeSignEditModal(event) {
    if (event && event.target !== document.getElementById('signEditModal')) return;
    document.getElementById('signEditModal').style.display = 'none';
}

function saveSignEdit() {
    const idx = parseInt(document.getElementById('signEditIndex').value);
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
        is_signed: parseInt(document.getElementById('signEditIsSigned').value),
        reason: document.getElementById('signEditReason').value,
        teacher: document.getElementById('signEditTeacher').value,
        remark: document.getElementById('signEditRemark').value,
        score: document.getElementById('signEditTotal').value,
        file_path: ''
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

    const signedCount = signPreviewStudents.filter(s => s.is_signed).length;
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
