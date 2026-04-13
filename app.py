from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime, timezone, timedelta
import uuid
import pandas as pd
import hashlib

# 北京时区 UTC+8
BEIJING_TZ = timezone(timedelta(hours=8))

def beijing_now():
    return datetime.now(BEIJING_TZ).strftime('%Y-%m-%d %H:%M:%S')

app = Flask(__name__)
CORS(app)

# 如果在 Render 上，使用持久化磁盘路径；本地开发使用当前目录
DATA_DIR = os.environ.get('RENDER_DATA_DIR', '.')
DATABASE = os.path.join(DATA_DIR, 'enrollment.db')
UPLOAD_FOLDER = os.path.join(DATA_DIR, 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    """对密码进行MD5哈希（兼容旧明文密码）"""
    if len(password) == 32 and all(c in '0123456789abcdef' for c in password.lower()):
        return password
    return hashlib.md5(password.encode('utf-8')).hexdigest()

def add_log(operator, action, target='', detail=''):
    """写入操作日志"""
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute(
            'INSERT INTO operation_logs (operator, action, target, detail, log_time) VALUES (?, ?, ?, ?, ?)',
            (operator, action, target, detail, beijing_now())
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        gender TEXT,
        phone1 TEXT NOT NULL,
        phone2 TEXT,
        district TEXT,
        school TEXT NOT NULL,
        graduation_year INTEGER,
        class_name TEXT,
        grade_total INTEGER,
        rank_初一上 INTEGER,
        rank_初一下 INTEGER,
        rank_初二上 INTEGER,
        rank_初二下 INTEGER,
        rank_初三上期中 INTEGER,
        rank_初三上期末 INTEGER,
        score_初二上 TEXT,
        score_初二下 TEXT,
        score_初三上期中 TEXT,
        score_初三上期末 TEXT,
        score_一模 TEXT,
        score_二模 TEXT,
        rank_初三一模 INTEGER,
        rank_初三二模 INTEGER,
        test_paper TEXT,
        test_location TEXT,
        math_score TEXT,
        english_score TEXT,
        total_score TEXT,
        evaluation TEXT,
        promised_class TEXT,
        is_signed INTEGER DEFAULT 0,
        reason TEXT DEFAULT '',
        score TEXT DEFAULT '',
        file_path TEXT,
        remark TEXT,
        teacher TEXT NOT NULL,
        createTime TEXT NOT NULL
    )''')

    # Auto-migrate: add new columns if they don't exist
    new_columns = [
        ('score_初二上', 'TEXT'),
        ('score_初二下', 'TEXT'),
        ('score_初三上期中', 'TEXT'),
        ('rank_初三一模', 'INTEGER'),
        ('rank_初三二模', 'INTEGER'),
    ]
    for col_name, col_type in new_columns:
        try:
            c.execute(f'ALTER TABLE students ADD COLUMN {col_name} {col_type}')
        except Exception:
            pass

    c.execute('''CREATE TABLE IF NOT EXISTS exam_papers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        year TEXT,
        description TEXT,
        file_path TEXT NOT NULL,
        uploader TEXT NOT NULL,
        upload_time TEXT NOT NULL
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operator TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        log_time TEXT NOT NULL
    )''')

    default_users = [
        ('admin', hash_password('admin123'), 'admin', '超级管理员'),
        ('manager', hash_password('manager123'), 'manager', '管理员'),
        ('teacher1', hash_password('teacher123'), 'teacher', '张老师'),
        ('teacher2', hash_password('teacher123'), 'teacher', '李老师')
    ]
    for user in default_users:
        try:
            c.execute('INSERT OR IGNORE INTO users (username, password, role, name) VALUES (?, ?, ?, ?)', user)
        except Exception:
            pass

    conn.commit()
    conn.close()


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    if path.startswith('uploads/'):
        return send_from_directory('uploads', path.split('uploads/')[1])
    return send_from_directory('.', path)


# ============================================================
# 登录
# ============================================================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    conn = get_db()
    c = conn.cursor()
    hashed = hash_password(password)
    # 兼容明文密码和哈希密码
    c.execute('SELECT * FROM users WHERE username = ? AND (password = ? OR password = ?)',
              (username, password, hashed))
    user = c.fetchone()
    conn.close()
    if user:
        add_log(username, '登录', '', '登录成功')
        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'role': user['role'],
                'name': user['name']
            }
        })
    else:
        return jsonify({'success': False, 'message': '用户名或密码错误'})


# ============================================================
# 学生管理
# ============================================================
@app.route('/api/students', methods=['POST'])
def add_student():
    try:
        data = request.json
        create_time = beijing_now()
        conn = get_db()
        c = conn.cursor()
        c.execute('''INSERT INTO students (
            name, gender, phone1, phone2, district, school, graduation_year,
            class_name, grade_total, rank_初一上, rank_初一下, rank_初二上,
            rank_初二下, rank_初三上期中, rank_初三上期末,
            score_初二上, score_初二下, score_初三上期中, score_初三上期末,
            score_一模, score_二模, rank_初三一模, rank_初三二模,
            test_paper, test_location, math_score,
            english_score, total_score, evaluation, promised_class, is_signed,
            reason, score, file_path, remark, teacher, createTime
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
            data['name'], data.get('gender', ''), data['phone1'], data.get('phone2', ''),
            data.get('district', ''), data['school'], data.get('graduation_year', None),
            data.get('class_name', ''), data.get('grade_total', None),
            data.get('rank_初一上', None), data.get('rank_初一下', None),
            data.get('rank_初二上', None), data.get('rank_初二下', None),
            data.get('rank_初三上期中', None), data.get('rank_初三上期末', None),
            data.get('score_初二上', ''), data.get('score_初二下', ''),
            data.get('score_初三上期中', ''), data.get('score_初三上期末', ''),
            data.get('score_一模', ''), data.get('score_二模', ''),
            data.get('rank_初三一模', None), data.get('rank_初三二模', None),
            data.get('test_paper', ''), data.get('test_location', ''),
            data.get('math_score', ''), data.get('english_score', ''), data.get('total_score', ''),
            data.get('evaluation', ''), data.get('promised_class', ''),
            data.get('is_signed', 0), data.get('reason', ''), data.get('score', ''),
            data.get('file_path', ''), data.get('remark', ''), data['teacher'], create_time
        ))
        conn.commit()
        student_id = c.lastrowid
        conn.close()
        add_log(data['teacher'], '新增学生', data['name'], f"学校：{data['school']}")
        return jsonify({'success': True, 'id': student_id})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/students', methods=['GET'])
def get_students():
    conn = get_db()
    c = conn.cursor()

    conditions = []
    params = []
    is_signed = request.args.get('is_signed')
    district = request.args.get('district')
    teacher = request.args.get('teacher')
    school = request.args.get('school')
    keyword = request.args.get('keyword')
    promised_class = request.args.get('promised_class')

    if is_signed is not None and is_signed != '':
        conditions.append('is_signed = ?')
        params.append(int(is_signed))
    if district:
        conditions.append('district LIKE ?')
        params.append(f'%{district}%')
    if teacher:
        conditions.append('teacher LIKE ?')
        params.append(f'%{teacher}%')
    if school:
        conditions.append('school LIKE ?')
        params.append(f'%{school}%')
    if promised_class:
        conditions.append('promised_class LIKE ?')
        params.append(f'%{promised_class}%')
    if keyword:
        conditions.append('(name LIKE ? OR school LIKE ? OR phone1 LIKE ?)')
        params.extend([f'%{keyword}%', f'%{keyword}%', f'%{keyword}%'])

    where = ('WHERE ' + ' AND '.join(conditions)) if conditions else ''
    c.execute(f'SELECT * FROM students {where} ORDER BY id DESC', params)
    students = c.fetchall()
    conn.close()

    result = []
    for s in students:
        result.append({
            'id': s['id'], 'name': s['name'], 'gender': s['gender'],
            'phone1': s['phone1'], 'phone2': s['phone2'], 'district': s['district'],
            'school': s['school'], 'graduation_year': s['graduation_year'],
            'class_name': s['class_name'], 'grade_total': s['grade_total'],
            'rank_初一上': s['rank_初一上'], 'rank_初一下': s['rank_初一下'],
            'rank_初二上': s['rank_初二上'], 'rank_初二下': s['rank_初二下'],
            'rank_初三上期中': s['rank_初三上期中'], 'rank_初三上期末': s['rank_初三上期末'],
            'score_初二上': s['score_初二上'] if 'score_初二上' in s.keys() else '',
            'score_初二下': s['score_初二下'] if 'score_初二下' in s.keys() else '',
            'score_初三上期中': s['score_初三上期中'] if 'score_初三上期中' in s.keys() else '',
            'score_初三上期末': s['score_初三上期末'], 'score_一模': s['score_一模'],
            'score_二模': s['score_二模'],
            'rank_初三一模': s['rank_初三一模'] if 'rank_初三一模' in s.keys() else None,
            'rank_初三二模': s['rank_初三二模'] if 'rank_初三二模' in s.keys() else None,
            'test_paper': s['test_paper'],
            'test_location': s['test_location'], 'math_score': s['math_score'],
            'english_score': s['english_score'], 'total_score': s['total_score'],
            'evaluation': s['evaluation'], 'promised_class': s['promised_class'],
            'is_signed': s['is_signed'], 'reason': s['reason'], 'score': s['score'],
            'file_path': s['file_path'], 'remark': s['remark'],
            'teacher': s['teacher'], 'createTime': s['createTime']
        })
    return jsonify(result)


@app.route('/api/students/<int:student_id>', methods=['GET'])
def get_student(student_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM students WHERE id = ?', (student_id,))
    s = c.fetchone()
    conn.close()
    if not s:
        return jsonify({'success': False, 'message': '学生不存在'})
    return jsonify({
        'id': s['id'], 'name': s['name'], 'gender': s['gender'],
        'phone1': s['phone1'], 'phone2': s['phone2'], 'district': s['district'],
        'school': s['school'], 'graduation_year': s['graduation_year'],
        'class_name': s['class_name'], 'grade_total': s['grade_total'],
        'rank_初一上': s['rank_初一上'], 'rank_初一下': s['rank_初一下'],
        'rank_初二上': s['rank_初二上'], 'rank_初二下': s['rank_初二下'],
        'rank_初三上期中': s['rank_初三上期中'], 'rank_初三上期末': s['rank_初三上期末'],
        'score_初二上': s['score_初二上'] if 'score_初二上' in s.keys() else '',
        'score_初二下': s['score_初二下'] if 'score_初二下' in s.keys() else '',
        'score_初三上期中': s['score_初三上期中'] if 'score_初三上期中' in s.keys() else '',
        'score_初三上期末': s['score_初三上期末'], 'score_一模': s['score_一模'],
        'score_二模': s['score_二模'],
        'rank_初三一模': s['rank_初三一模'] if 'rank_初三一模' in s.keys() else None,
        'rank_初三二模': s['rank_初三二模'] if 'rank_初三二模' in s.keys() else None,
        'test_paper': s['test_paper'],
        'test_location': s['test_location'], 'math_score': s['math_score'],
        'english_score': s['english_score'], 'total_score': s['total_score'],
        'evaluation': s['evaluation'], 'promised_class': s['promised_class'],
        'is_signed': s['is_signed'], 'reason': s['reason'], 'score': s['score'],
        'file_path': s['file_path'], 'remark': s['remark'],
        'teacher': s['teacher'], 'createTime': s['createTime']
    })


@app.route('/api/students/<int:student_id>', methods=['PUT'])
def update_student(student_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('''UPDATE students SET
            name=?, gender=?, phone1=?, phone2=?, district=?,
            school=?, graduation_year=?, class_name=?, grade_total=?,
            rank_初一上=?, rank_初一下=?, rank_初二上=?, rank_初二下=?,
            rank_初三上期中=?, rank_初三上期末=?,
            score_初二上=?, score_初二下=?, score_初三上期中=?, score_初三上期末=?,
            score_一模=?, score_二模=?, rank_初三一模=?, rank_初三二模=?,
            test_paper=?, test_location=?,
            math_score=?, english_score=?, total_score=?, evaluation=?,
            promised_class=?, is_signed=?, reason=?, score=?,
            file_path=?, remark=?, teacher=?
            WHERE id=?''', (
            data['name'], data.get('gender', ''), data['phone1'], data.get('phone2', ''),
            data.get('district', ''), data['school'], data.get('graduation_year', None),
            data.get('class_name', ''), data.get('grade_total', None),
            data.get('rank_初一上', None), data.get('rank_初一下', None),
            data.get('rank_初二上', None), data.get('rank_初二下', None),
            data.get('rank_初三上期中', None), data.get('rank_初三上期末', None),
            data.get('score_初二上', ''), data.get('score_初二下', ''),
            data.get('score_初三上期中', ''), data.get('score_初三上期末', ''),
            data.get('score_一模', ''), data.get('score_二模', ''),
            data.get('rank_初三一模', None), data.get('rank_初三二模', None),
            data.get('test_paper', ''), data.get('test_location', ''),
            data.get('math_score', ''), data.get('english_score', ''), data.get('total_score', ''),
            data.get('evaluation', ''), data.get('promised_class', ''),
            data.get('is_signed', 0), data.get('reason', ''), data.get('score', ''),
            data.get('file_path', ''), data.get('remark', ''), data['teacher'],
            student_id
        ))
        conn.commit()
        conn.close()
        add_log(data['teacher'], '编辑学生', data['name'], f"ID:{student_id}")
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    operator_name = request.args.get('operator_name', 'system')
    operator_role = request.args.get('operator_role', '')
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('SELECT name, teacher FROM students WHERE id = ?', (student_id,))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({'success': False, 'message': '学生不存在'})
        name = row['name']
        # teacher 角色只能删除自己登记的学生
        if operator_role == 'teacher' and row['teacher'] != operator_name:
            conn.close()
            return jsonify({'success': False, 'message': '权限不足，只能删除自己登记的学生'})
        c.execute('DELETE FROM students WHERE id = ?', (student_id,))
        conn.commit()
        conn.close()
        add_log(operator_name, '删除学生', name, f"ID:{student_id}")
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


# ============================================================
# 用户管理
# ============================================================
@app.route('/api/users', methods=['GET'])
def get_users():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id, username, role, name FROM users ORDER BY id DESC')
    users = c.fetchall()
    conn.close()
    return jsonify([{
        'id': u['id'], 'username': u['username'],
        'role': u['role'], 'name': u['name']
    } for u in users])


@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)', (
            data['username'], hash_password(data['password']),
            data['role'], data['name']
        ))
        conn.commit()
        user_id = c.lastrowid
        conn.close()
        add_log('admin', '新增用户', data['username'], f"角色：{data['role']}")
        return jsonify({'success': True, 'id': user_id})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    try:
        if data.get('password'):
            c.execute('UPDATE users SET username=?, password=?, role=?, name=? WHERE id=?', (
                data['username'], hash_password(data['password']),
                data['role'], data['name'], user_id
            ))
        else:
            c.execute('UPDATE users SET username=?, role=?, name=? WHERE id=?', (
                data['username'], data['role'], data['name'], user_id
            ))
        conn.commit()
        conn.close()
        add_log('admin', '编辑用户', data['username'], f"ID:{user_id}")
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('SELECT username FROM users WHERE id = ?', (user_id,))
        row = c.fetchone()
        uname = row['username'] if row else str(user_id)
        c.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        conn.close()
        add_log('admin', '删除用户', uname, f"ID:{user_id}")
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/users/change-password', methods=['POST'])
def change_password():
    """修改当前用户密码"""
    data = request.json
    username = data.get('username')
    old_password = data.get('old_password')
    new_password = data.get('new_password')
    if not all([username, old_password, new_password]):
        return jsonify({'success': False, 'message': '参数不完整'})
    conn = get_db()
    c = conn.cursor()
    old_hashed = hash_password(old_password)
    c.execute('SELECT * FROM users WHERE username = ? AND (password = ? OR password = ?)',
              (username, old_password, old_hashed))
    user = c.fetchone()
    if not user:
        conn.close()
        return jsonify({'success': False, 'message': '原密码错误'})
    c.execute('UPDATE users SET password = ? WHERE username = ?',
              (hash_password(new_password), username))
    conn.commit()
    conn.close()
    add_log(username, '修改密码', username, '')
    return jsonify({'success': True, 'message': '密码修改成功'})


# ============================================================
# 文件上传
# ============================================================
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'})
    if file:
        filename = str(uuid.uuid4()) + '_' + file.filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        return jsonify({'success': True, 'file_path': filename})


# ============================================================
# 数据统计
# ============================================================
@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    conn = get_db()
    c = conn.cursor()

    c.execute('SELECT COUNT(*) as total FROM students')
    total = c.fetchone()['total']

    c.execute('SELECT COUNT(*) as signed FROM students WHERE is_signed = 1')
    signed = c.fetchone()['signed']

    c.execute('''SELECT district, COUNT(*) as cnt FROM students
                 WHERE district IS NOT NULL AND district != ""
                 GROUP BY district ORDER BY cnt DESC LIMIT 10''')
    by_district = [{'district': r['district'], 'count': r['cnt']} for r in c.fetchall()]

    c.execute('''SELECT teacher, COUNT(*) as cnt,
                        SUM(CASE WHEN is_signed=1 THEN 1 ELSE 0 END) as signed_cnt
                 FROM students WHERE teacher IS NOT NULL AND teacher != ""
                 GROUP BY teacher ORDER BY cnt DESC LIMIT 10''')
    by_teacher = [{'teacher': r['teacher'], 'total': r['cnt'], 'signed': r['signed_cnt']} for r in c.fetchall()]

    c.execute('''SELECT promised_class, COUNT(*) as cnt FROM students
                 WHERE promised_class IS NOT NULL AND promised_class != ""
                 GROUP BY promised_class ORDER BY cnt DESC''')
    by_class = [{'class': r['promised_class'], 'count': r['cnt']} for r in c.fetchall()]

    c.execute('''SELECT school, COUNT(*) as cnt FROM students
                 WHERE school IS NOT NULL AND school != ""
                 GROUP BY school ORDER BY cnt DESC LIMIT 10''')
    by_school = [{'school': r['school'], 'count': r['cnt']} for r in c.fetchall()]

    c.execute('''SELECT date(createTime) as day, COUNT(*) as cnt
                 FROM students WHERE date(createTime) >= date('now', '-6 days')
                 GROUP BY day ORDER BY day''')
    daily_trend = [{'day': r['day'], 'count': r['cnt']} for r in c.fetchall()]

    c.execute('SELECT COUNT(*) as paper_total FROM exam_papers')
    paper_total = c.fetchone()['paper_total']

    conn.close()
    return jsonify({
        'total': total,
        'signed': signed,
        'unsigned': total - signed,
        'sign_rate': round(signed / total * 100, 1) if total > 0 else 0,
        'by_district': by_district,
        'by_teacher': by_teacher,
        'by_class': by_class,
        'by_school': by_school,
        'daily_trend': daily_trend,
        'paper_total': paper_total
    })


# ============================================================
# 操作日志
# ============================================================
@app.route('/api/logs', methods=['GET'])
def get_logs():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM operation_logs ORDER BY id DESC LIMIT 200')
    logs = c.fetchall()
    conn.close()
    return jsonify([{
        'id': r['id'], 'operator': r['operator'], 'action': r['action'],
        'target': r['target'], 'detail': r['detail'], 'log_time': r['log_time']
    } for r in logs])


# ============================================================
# Excel预览解析（不直接入库，返回数据供前端审核）
# ============================================================
@app.route('/api/preview-excel', methods=['POST'])
def preview_excel():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未上传文件'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '未选择文件'})
    try:
        # 强制所有列读取为字符串，防止前导0丢失
        df = pd.read_excel(file, dtype=str)
        df = df[df['学生姓名'].notna() & (df['学生姓名'].astype(str).str.strip() != '') & (df['学生姓名'].astype(str).str.strip() != 'nan')]

        students = []
        for _, row in df.iterrows():
            def safe(val, default=''):
                if pd.isna(val):
                    return default
                s = str(val).strip()
                return default if s == 'nan' else s

            def safe_num(val):
                if pd.isna(val):
                    return None
                try:
                    v = float(val)
                    return int(v) if v == int(v) else v
                except Exception:
                    return None

            def safe_phone(val):
                if pd.isna(val):
                    return ''
                try:
                    v = float(val)
                    return str(int(v))
                except Exception:
                    return str(val).strip()

            students.append({
                'name': safe(row.get('学生姓名', '')),
                'gender': safe(row.get('性别', '')),
                'phone1': safe_phone(row.get('联系电话1', '')),
                'phone2': safe_phone(row.get('联系电话2', '')),
                'district': safe(row.get('行政区', '')),
                'school': safe(row.get('初中学校名称', '')),
                'graduation_year': safe_num(row.get('毕业年份')),
                'class_name': safe(row.get('班级', '')),
                'grade_total': safe_num(row.get('年级总人数')),
                'rank_初一上': safe_num(row.get('初一上期末年级排名')),
                'rank_初一下': safe_num(row.get('初一下期末年级排名')),
                'rank_初二上': safe_num(row.get('初二上期末年级排名')),
                'rank_初二下': safe_num(row.get('初二下期末年级排名')),
                'rank_初三上期中': safe_num(row.get('初三上期中年级排名')),
                'rank_初三上期末': safe_num(row.get('初三上期末排名')),
                'score_初三上期末': safe(row.get('初三上期末分数', '')),
                'score_一模': safe(row.get('初三一模分数', '')),
                'score_二模': safe(row.get('初三二模分数', '')),
                'test_paper': safe(row.get('测试试卷', '')),
                'test_location': safe(row.get('测试地点', '')),
                'math_score': safe(row.get('数学', '')),
                'english_score': safe(row.get('英语', '')),
                'total_score': safe(row.get('总分', '')),
                'evaluation': safe(row.get('评价等级', '')),
                'promised_class': safe(row.get('承诺班型', '')),
                'is_signed': 1 if safe(row.get('是否已签约', '否')).strip() in ['是', '1', 'True', '已签约'] else 0,
                'reason': '',
                'score': safe(row.get('总分', '')),
                'file_path': '',
                'remark': '',
                'teacher': safe(row.get('负责老师', ''))
            })

        return jsonify({'success': True, 'students': students, 'total': len(students)})
    except Exception as e:
        return jsonify({'success': False, 'message': f'解析Excel失败：{str(e)}'})


# ============================================================
# 批量签约（审核后确认入库）
# ============================================================
@app.route('/api/batch-sign', methods=['POST'])
def batch_sign():
    try:
        data = request.json
        students = data.get('students', [])
        teacher = data.get('teacher', '')
        if not students:
            return jsonify({'success': False, 'message': '没有学生数据'})
        conn = get_db()
        c = conn.cursor()
        create_time = beijing_now()
        success_count = 0
        for s in students:
            try:
                c.execute('''INSERT INTO students (
                    name, gender, phone1, phone2, district, school, graduation_year,
                    class_name, grade_total, rank_初一上, rank_初一下, rank_初二上,
                    rank_初二下, rank_初三上期中, rank_初三上期末, score_初三上期末,
                    score_一模, score_二模, test_paper, test_location, math_score,
                    english_score, total_score, evaluation, promised_class, is_signed,
                    reason, score, file_path, remark, teacher, createTime
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
                    s.get('name', ''), s.get('gender', ''), s.get('phone1', ''), s.get('phone2', ''),
                    s.get('district', ''), s.get('school', ''), s.get('graduation_year'),
                    s.get('class_name', ''), s.get('grade_total'),
                    s.get('rank_初一上'), s.get('rank_初一下'), s.get('rank_初二上'), s.get('rank_初二下'),
                    s.get('rank_初三上期中'), s.get('rank_初三上期末'),
                    s.get('score_初三上期末', ''), s.get('score_一模', ''), s.get('score_二模', ''),
                    s.get('test_paper', ''), s.get('test_location', ''),
                    s.get('math_score', ''), s.get('english_score', ''), s.get('total_score', ''),
                    s.get('evaluation', ''), s.get('promised_class', ''),
                    s.get('is_signed', 0), s.get('reason', ''), s.get('score', ''),
                    s.get('file_path', ''), s.get('remark', ''),
                    s.get('teacher') or teacher, create_time
                ))
                success_count += 1
            except Exception:
                pass
        conn.commit()
        conn.close()
        add_log(teacher, '批量签约', f'{success_count}名学生', f'共提交{len(students)}条')
        return jsonify({'success': True, 'message': f'成功签约 {success_count} 名学生', 'count': success_count})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


# ============================================================
# 试卷管理
# ============================================================
@app.route('/api/exam-papers', methods=['GET'])
def get_exam_papers():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM exam_papers ORDER BY id DESC')
    papers = c.fetchall()
    conn.close()
    return jsonify([{
        'id': p['id'], 'title': p['title'], 'year': p['year'],
        'description': p['description'], 'file_path': p['file_path'],
        'uploader': p['uploader'], 'upload_time': p['upload_time']
    } for p in papers])


@app.route('/api/exam-papers', methods=['POST'])
def upload_exam_paper():
    # 仅超级管理员（admin）可上传试卷
    operator_role = request.form.get('operator_role', '')
    if operator_role != 'admin':
        return jsonify({'success': False, 'message': '权限不足，仅超级管理员可上传试卷'})
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未上传文件'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '未选择文件'})
    title = request.form.get('title', '')
    year = request.form.get('year', '')
    description = request.form.get('description', '')
    uploader = request.form.get('uploader', '')
    if not title:
        return jsonify({'success': False, 'message': '请填写试卷名称'})
    try:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ['.pdf', '.jpg', '.jpeg', '.png']:
            return jsonify({'success': False, 'message': '仅支持 PDF、JPG、PNG 格式'})
        filename = 'paper_' + str(uuid.uuid4()) + ext
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        upload_time = beijing_now()
        conn = get_db()
        c = conn.cursor()
        c.execute('INSERT INTO exam_papers (title, year, description, file_path, uploader, upload_time) VALUES (?, ?, ?, ?, ?, ?)',
                  (title, year, description, filename, uploader, upload_time))
        conn.commit()
        paper_id = c.lastrowid
        conn.close()
        add_log(uploader, '上传试卷', title, f"年份：{year}")
        return jsonify({'success': True, 'id': paper_id, 'message': '试卷上传成功'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/exam-papers/<int:paper_id>', methods=['DELETE'])
def delete_exam_paper(paper_id):
    # 仅超级管理员（admin）可删除试卷
    operator_role = request.args.get('operator_role', '')
    operator_name = request.args.get('operator_name', 'admin')
    if operator_role != 'admin':
        return jsonify({'success': False, 'message': '权限不足，仅超级管理员可删除试卷'})
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('SELECT file_path, title FROM exam_papers WHERE id = ?', (paper_id,))
        paper = c.fetchone()
        if paper:
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], paper['file_path'])
            if os.path.exists(filepath):
                os.remove(filepath)
            add_log(operator_name, '删除试卷', paper['title'], f"ID:{paper_id}")
        c.execute('DELETE FROM exam_papers WHERE id = ?', (paper_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


# 保留旧的import-excel接口（直接入库，向后兼容）
@app.route('/api/import-excel', methods=['POST'])
def import_excel():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'})
    if file:
        try:
            df = pd.read_excel(file)
            conn = get_db()
            c = conn.cursor()
            for index, row in df.iterrows():
                create_time = beijing_now()
                c.execute('''INSERT INTO students (
                    name, gender, phone1, phone2, district, school, graduation_year,
                    class_name, grade_total, rank_初一上, rank_初一下, rank_初二上,
                    rank_初二下, rank_初三上期中, rank_初三上期末, score_初三上期末,
                    score_一模, score_二模, test_paper, test_location, math_score,
                    english_score, total_score, evaluation, promised_class, is_signed,
                    reason, score, file_path, remark, teacher, createTime
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
                    row.get('学生姓名', ''), row.get('性别', ''),
                    row.get('联系电话1', ''), row.get('联系电话2', ''),
                    row.get('行政区', ''), row.get('初中学校名称', ''),
                    row.get('毕业年份', None), row.get('班级', ''),
                    row.get('年级总人数', None),
                    row.get('初一上期末年级排名', None), row.get('初一下期末年级排名', None),
                    row.get('初二上期末年级排名', None), row.get('初二下期末年级排名', None),
                    row.get('初三上期中年级排名', None), row.get('初三上期末排名', None),
                    row.get('初三上期末分数', ''), row.get('初三一模分数', ''), row.get('初三二模分数', ''),
                    row.get('测试试卷', ''), row.get('测试地点', ''),
                    row.get('数学', ''), row.get('英语', ''), row.get('总分', ''),
                    row.get('评价等级', ''), row.get('承诺班型', ''),
                    1 if row.get('是否已签约', '否') == '是' else 0,
                    row.get('签约理由', ''), row.get('成绩', ''),
                    row.get('文件路径', ''), row.get('备注', ''),
                    row.get('负责老师', ''), create_time
                ))
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': f'成功导入 {len(df)} 条数据'})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)})


# 应用启动时初始化数据库
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=False)
