from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pymysql
import pymysql.cursors
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

# 上传目录
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', './uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# ============================================================
# MySQL 数据库连接
# ============================================================
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USER', 'student_app'),
    'password': os.environ.get('DB_PASSWORD', 'StudentApp2026!'),
    'database': os.environ.get('DB_NAME', 'student_db'),
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
    'autocommit': False
}

def get_db():
    conn = pymysql.connect(**DB_CONFIG)
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
        with conn.cursor() as c:
            c.execute(
                'INSERT INTO operation_logs (operator, action, target, detail, log_time) VALUES (%s, %s, %s, %s, %s)',
                (operator, action, target, detail, beijing_now())
            )
        conn.commit()
        conn.close()
    except Exception:
        pass

def init_db():
    conn = get_db()
    with conn.cursor() as c:

        c.execute('''CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL,
            name VARCHAR(100) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

        c.execute('''CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            gender VARCHAR(10),
            phone1 VARCHAR(30) NOT NULL,
            phone2 VARCHAR(30),
            district VARCHAR(50),
            school VARCHAR(100) NOT NULL,
            graduation_year INT,
            class_name VARCHAR(50),
            grade_total INT,
            rank_初一上 INT,
            rank_初一下 INT,
            rank_初二上 INT,
            rank_初二下 INT,
            rank_初三上期中 INT,
            rank_初三上期末 INT,
            score_初二上 VARCHAR(50),
            score_初二下 VARCHAR(50),
            score_初三上期中 VARCHAR(50),
            score_初三上期末 VARCHAR(50),
            score_一模 VARCHAR(50),
            score_二模 VARCHAR(50),
            rank_初三一模 INT,
            rank_初三二模 INT,
            test_paper VARCHAR(100),
            test_location VARCHAR(100),
            math_score VARCHAR(50),
            english_score VARCHAR(50),
            total_score VARCHAR(50),
            evaluation VARCHAR(50),
            promised_class VARCHAR(50),
            is_signed TINYINT DEFAULT 0,
            reason TEXT,
            score VARCHAR(50),
            file_path VARCHAR(255),
            remark TEXT,
            recognition_no VARCHAR(50),
            assigned_teacher VARCHAR(100),
            teacher VARCHAR(100) NOT NULL,
            createTime VARCHAR(30) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

        c.execute('''CREATE TABLE IF NOT EXISTS exam_papers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            year VARCHAR(20),
            description TEXT,
            file_path VARCHAR(255) NOT NULL,
            uploader VARCHAR(100) NOT NULL,
            upload_time VARCHAR(30) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

        c.execute('''CREATE TABLE IF NOT EXISTS operation_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            operator VARCHAR(100) NOT NULL,
            action VARCHAR(100) NOT NULL,
            target VARCHAR(200),
            detail TEXT,
            log_time VARCHAR(30) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

        # 默认用户（使用 INSERT IGNORE 避免重复）
        default_users = [
            ('admin', hash_password('admin123'), 'admin', '超级管理员'),
            ('manager', hash_password('manager123'), 'manager', '管理员'),
            ('teacher1', hash_password('teacher123'), 'teacher', '张老师'),
            ('teacher2', hash_password('teacher123'), 'teacher', '李老师')
        ]
        for user in default_users:
            try:
                c.execute('INSERT IGNORE INTO users (username, password, role, name) VALUES (%s, %s, %s, %s)', user)
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
    with conn.cursor() as c:
        hashed = hash_password(password)
        c.execute('SELECT * FROM users WHERE username = %s AND (password = %s OR password = %s)',
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
        # 认定编号：若 is_certified=1 则自动生成
        is_certified = int(data.get('is_certified', 0))
        recognition_no = ''
        if is_certified == 1:
            recognition_no = generate_recognition_no()
        is_signed = 1 if recognition_no else 0

        conn = get_db()
        with conn.cursor() as c:
            c.execute('''INSERT INTO students (
                name, gender, phone1, phone2, district, school, graduation_year,
                class_name, grade_total, rank_初一上, rank_初一下, rank_初二上,
                rank_初二下, rank_初三上期中, rank_初三上期末,
                score_初二上, score_初二下, score_初三上期中, score_初三上期末,
                score_一模, score_二模, rank_初三一模, rank_初三二模,
                test_paper, test_location, math_score,
                english_score, total_score, evaluation, promised_class, is_signed,
                reason, score, file_path, remark, recognition_no, assigned_teacher, teacher, createTime
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''', (
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
                is_signed, data.get('reason', ''), data.get('score', ''),
                data.get('file_path', ''), data.get('remark', ''),
                recognition_no,
                data.get('assigned_teacher', data['teacher']),
                data['teacher'], create_time
            ))
            student_id = c.lastrowid
        conn.commit()
        conn.close()
        add_log(data['teacher'], '新增学生', data['name'], f"学校：{data['school']}")
        return jsonify({'success': True, 'id': student_id, 'recognition_no': recognition_no})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/students', methods=['GET'])
def get_students():
    conn = get_db()
    with conn.cursor() as c:
        conditions = []
        params = []
        is_signed = request.args.get('is_signed')
        district = request.args.get('district')
        teacher = request.args.get('teacher')
        school = request.args.get('school')
        keyword = request.args.get('keyword')
        promised_class = request.args.get('promised_class')
        current_role = request.args.get('role', '')
        current_username = request.args.get('username', '')
        current_name = request.args.get('name', '')

        if is_signed is not None and is_signed != '':
            conditions.append('is_signed = %s')
            params.append(int(is_signed))
        if district:
            conditions.append('district LIKE %s')
            params.append(f'%{district}%')
        if teacher:
            conditions.append('(teacher LIKE %s OR assigned_teacher LIKE %s)')
            params.extend([f'%{teacher}%', f'%{teacher}%'])
        if school:
            conditions.append('school LIKE %s')
            params.append(f'%{school}%')
        if promised_class:
            conditions.append('promised_class LIKE %s')
            params.append(f'%{promised_class}%')
        if keyword:
            conditions.append('(name LIKE %s OR school LIKE %s OR phone1 LIKE %s)')
            params.extend([f'%{keyword}%', f'%{keyword}%', f'%{keyword}%'])
        if current_role == 'teacher' and (current_username or current_name):
            conditions.append('(assigned_teacher = %s OR assigned_teacher = %s OR teacher = %s OR teacher = %s)')
            params.extend([current_username, current_name, current_username, current_name])

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
            'score_初二上': s.get('score_初二上', ''),
            'score_初二下': s.get('score_初二下', ''),
            'score_初三上期中': s.get('score_初三上期中', ''),
            'score_初三上期末': s['score_初三上期末'], 'score_一模': s['score_一模'],
            'score_二模': s['score_二模'],
            'rank_初三一模': s.get('rank_初三一模'),
            'rank_初三二模': s.get('rank_初三二模'),
            'test_paper': s['test_paper'],
            'test_location': s['test_location'], 'math_score': s['math_score'],
            'english_score': s['english_score'], 'total_score': s['total_score'],
            'evaluation': s['evaluation'], 'promised_class': s['promised_class'],
            'is_signed': s['is_signed'], 'reason': s['reason'], 'score': s['score'],
            'file_path': s['file_path'], 'remark': s['remark'],
            'recognition_no': s.get('recognition_no', ''),
            'assigned_teacher': s.get('assigned_teacher', ''),
            'teacher': s['teacher'], 'createTime': s['createTime']
        })
    return jsonify(result)


@app.route('/api/students/<int:student_id>', methods=['GET'])
def get_student(student_id):
    conn = get_db()
    with conn.cursor() as c:
        c.execute('SELECT * FROM students WHERE id = %s', (student_id,))
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
        'score_初二上': s.get('score_初二上', ''),
        'score_初二下': s.get('score_初二下', ''),
        'score_初三上期中': s.get('score_初三上期中', ''),
        'score_初三上期末': s['score_初三上期末'], 'score_一模': s['score_一模'],
        'score_二模': s['score_二模'],
        'rank_初三一模': s.get('rank_初三一模'),
        'rank_初三二模': s.get('rank_初三二模'),
        'test_paper': s['test_paper'],
        'test_location': s['test_location'], 'math_score': s['math_score'],
        'english_score': s['english_score'], 'total_score': s['total_score'],
        'evaluation': s['evaluation'], 'promised_class': s['promised_class'],
        'is_signed': s['is_signed'], 'reason': s['reason'], 'score': s['score'],
        'file_path': s['file_path'], 'remark': s['remark'],
        'recognition_no': s.get('recognition_no', ''),
        'assigned_teacher': s.get('assigned_teacher', ''),
        'teacher': s['teacher'], 'createTime': s['createTime']
    })


@app.route('/api/students/<int:student_id>', methods=['PUT'])
def update_student(student_id):
    data = request.json
    conn = get_db()
    try:
        with conn.cursor() as c:
            # 认定编号处理：recognition_no 不为空则 is_signed=1
            recognition_no = data.get('recognition_no', '')
            is_signed = 1 if recognition_no else int(data.get('is_signed', 0))
            c.execute('''UPDATE students SET
                name=%s, gender=%s, phone1=%s, phone2=%s, district=%s,
                school=%s, graduation_year=%s, class_name=%s, grade_total=%s,
                rank_初一上=%s, rank_初一下=%s, rank_初二上=%s, rank_初二下=%s,
                rank_初三上期中=%s, rank_初三上期末=%s,
                score_初二上=%s, score_初二下=%s, score_初三上期中=%s, score_初三上期末=%s,
                score_一模=%s, score_二模=%s, rank_初三一模=%s, rank_初三二模=%s,
                test_paper=%s, test_location=%s,
                math_score=%s, english_score=%s, total_score=%s, evaluation=%s,
                promised_class=%s, is_signed=%s, reason=%s, score=%s,
                file_path=%s, remark=%s, recognition_no=%s, assigned_teacher=%s, teacher=%s
                WHERE id=%s''', (
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
                is_signed, data.get('reason', ''), data.get('score', ''),
                data.get('file_path', ''), data.get('remark', ''),
                recognition_no,
                data.get('assigned_teacher', data['teacher']),
                data['teacher'],
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
    try:
        with conn.cursor() as c:
            c.execute('SELECT name, teacher FROM students WHERE id = %s', (student_id,))
            row = c.fetchone()
            if not row:
                conn.close()
                return jsonify({'success': False, 'message': '学生不存在'})
            name = row['name']
            if operator_role == 'teacher' and row['teacher'] != operator_name:
                conn.close()
                return jsonify({'success': False, 'message': '权限不足，只能删除自己登记的学生'})
            c.execute('DELETE FROM students WHERE id = %s', (student_id,))
        conn.commit()
        conn.close()
        add_log(operator_name, '删除学生', name, f"ID:{student_id}")
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


# ============================================================
# 一键清空学生数据（仅超级管理员）
# ============================================================
@app.route('/api/students/clear-all', methods=['DELETE'])
def clear_all_students():
    operator_name = request.args.get('operator_name', '')
    operator_role = request.args.get('operator_role', '')
    confirm = request.args.get('confirm', '')
    # 仅允许超级管理员（admin角色）操作
    if operator_role != 'admin':
        return jsonify({'success': False, 'message': '权限不足，仅超级管理员可执行此操作'})
    if confirm != 'yes':
        return jsonify({'success': False, 'message': '请传入 confirm=yes 参数确认操作'})
    conn = get_db()
    try:
        with conn.cursor() as c:
            c.execute('SELECT COUNT(*) as cnt FROM students')
            row = c.fetchone()
            total = row['cnt'] if row else 0
            c.execute('DELETE FROM students')
        conn.commit()
        conn.close()
        add_log(operator_name, '一键清空', '全部学生数据', f'共删除 {total} 条记录')
        return jsonify({'success': True, 'message': f'已成功清空 {total} 条学生数据', 'deleted': total})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


# ============================================================
# 一键编号（超级管理员和管理员可用）
# 按传入的 student_ids 顺序，从 2600001 开始依次分配认定编号并写入数据库
# ============================================================
@app.route('/api/students/auto-number', methods=['POST'])
def auto_number_students():
    data = request.get_json() or {}
    operator_name = data.get('operator_name', '')
    operator_role = data.get('operator_role', '')
    raw_student_ids = data.get('student_ids', [])  # 按展示顺序传入的 id 列表
    if operator_role not in ('admin', 'manager'):
        return jsonify({'success': False, 'message': '权限不足，仅管理员及以上可执行此操作'})
    if not raw_student_ids:
        return jsonify({'success': False, 'message': '未提供学生列表'})

    student_ids = []
    seen_ids = set()
    for sid in raw_student_ids:
        try:
            sid_int = int(sid)
        except Exception:
            continue
        if sid_int <= 0 or sid_int in seen_ids:
            continue
        seen_ids.add(sid_int)
        student_ids.append(sid_int)

    if not student_ids:
        return jsonify({'success': False, 'message': '学生列表无效，请刷新后重试'})

    start_no = 2600001
    end_no = start_no + len(student_ids) - 1
    id_placeholders = ','.join(['%s'] * len(student_ids))
    temp_prefix = f"TMP{uuid.uuid4().hex[:10]}"

    conn = get_db()
    try:
        with conn.cursor() as c:
            c.execute(f'SELECT id FROM students WHERE id IN ({id_placeholders})', student_ids)
            existing_ids = {row['id'] for row in c.fetchall()}
            missing_ids = [sid for sid in student_ids if sid not in existing_ids]
            if missing_ids:
                raise ValueError('部分学生不存在，请刷新列表后重试')

            for sid in student_ids:
                c.execute(
                    'UPDATE students SET recognition_no=%s, is_signed=1 WHERE id=%s',
                    (f'{temp_prefix}{sid}', sid)
                )

            conflict_sql = f'''
                UPDATE students
                SET recognition_no='', is_signed=0
                WHERE recognition_no REGEXP '^[0-9]+$'
                  AND CAST(recognition_no AS UNSIGNED) BETWEEN %s AND %s
                  AND id NOT IN ({id_placeholders})
            '''
            c.execute(conflict_sql, [start_no, end_no, *student_ids])
            cleared_count = c.rowcount

            for i, sid in enumerate(student_ids):
                new_no = str(start_no + i)
                c.execute(
                    'UPDATE students SET recognition_no=%s, is_signed=1 WHERE id=%s',
                    (new_no, sid)
                )

        conn.commit()
        conn.close()
        add_log(operator_name, '一键编号', '当前列表', f'共分配 {len(student_ids)} 个编号，范围 {start_no}-{end_no}，清理冲突 {cleared_count} 条')
        return jsonify({
            'success': True,
            'message': f'已成功为 {len(student_ids)} 位学生重新分配认定编号，范围：{start_no} ~ {end_no}',
            'count': len(student_ids),
            'cleared_conflicts': cleared_count
        })
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


# ============================================================
# 用户管理
# ============================================================
@app.route('/api/users', methods=['GET'])
def get_users():
    conn = get_db()
    with conn.cursor() as c:
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
    try:
        with conn.cursor() as c:
            c.execute('INSERT INTO users (username, password, role, name) VALUES (%s, %s, %s, %s)', (
                data['username'], hash_password(data['password']),
                data['role'], data['name']
            ))
            user_id = c.lastrowid
        conn.commit()
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
    try:
        with conn.cursor() as c:
            if data.get('password'):
                c.execute('UPDATE users SET username=%s, password=%s, role=%s, name=%s WHERE id=%s', (
                    data['username'], hash_password(data['password']),
                    data['role'], data['name'], user_id
                ))
            else:
                c.execute('UPDATE users SET username=%s, role=%s, name=%s WHERE id=%s', (
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
    try:
        with conn.cursor() as c:
            c.execute('SELECT username FROM users WHERE id = %s', (user_id,))
            row = c.fetchone()
            uname = row['username'] if row else str(user_id)
            c.execute('DELETE FROM users WHERE id = %s', (user_id,))
        conn.commit()
        conn.close()
        add_log('admin', '删除用户', uname, f"ID:{user_id}")
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/users/change-password', methods=['POST'])
def change_password():
    data = request.json
    username = data.get('username')
    old_password = data.get('old_password')
    new_password = data.get('new_password')
    if not all([username, old_password, new_password]):
        return jsonify({'success': False, 'message': '参数不完整'})
    conn = get_db()
    with conn.cursor() as c:
        old_hashed = hash_password(old_password)
        c.execute('SELECT * FROM users WHERE username = %s AND (password = %s OR password = %s)',
                  (username, old_password, old_hashed))
        user = c.fetchone()
        if not user:
            conn.close()
            return jsonify({'success': False, 'message': '原密码错误'})
        c.execute('UPDATE users SET password = %s WHERE username = %s',
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
    with conn.cursor() as c:
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

        c.execute('''SELECT DATE(createTime) as day, COUNT(*) as cnt
                     FROM students WHERE DATE(createTime) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                     GROUP BY day ORDER BY day''')
        daily_trend = [{'day': str(r['day']), 'count': r['cnt']} for r in c.fetchall()]

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
    with conn.cursor() as c:
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

            # 判断是否需要认定：表格中"认定编号"列有值（非空）则认定，系统忽略原始编号并自动分配新编号
            # 同时兼容"是否认定"列（如果表格有该列）
            recognition_no_raw = safe(row.get('认定编号', ''))
            is_certified_col = safe(row.get('是否认定', ''))
            if recognition_no_raw:  # 认定编号列有值，视为需要认定
                is_certified = 1
            elif is_certified_col in ('是', '1', 'yes', 'Yes', 'YES', 'true', 'True'):  # 兼容是否认定列
                is_certified = 1
            else:
                is_certified = 0
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
                'rank_初一上': safe_num(row.get('八上期末年级排名')),
                'rank_初一下': safe_num(row.get('八下期末年级排名')),
                'rank_初二上': safe_num(row.get('九上期中年级排名')),
                'rank_初二下': safe_num(row.get('九上期末排名')),
                'score_初三上期末': safe(row.get('九上期末分数', '')),
                'score_一模': safe(row.get('一模成绩', '')),
                'score_二模': safe(row.get('二模成绩', '')),
                'test_paper': safe(row.get('测试试卷', '')),
                'test_location': safe(row.get('测试地点', '')),
                'math_score': safe(row.get('数学', '')),
                'english_score': safe(row.get('英语', '')),
                'total_score': safe(row.get('总分', '')),
                'evaluation': safe(row.get('评价等级', '')),
                'promised_class': safe(row.get('承诺班型', '')),
                'is_certified': is_certified,   # 标记是否需要认定，编号由batch_sign统一分配
                'is_signed': 0,                 # 入库前不设置，由batch_sign决定
                'recognition_no': '',           # 忽略表格中的认定编号，由系统自动分配
                'reason': '',
                'score': safe(row.get('总分', '')),
                'file_path': '',
                'remark': safe(row.get('备注', '')),
                'assigned_teacher': safe(row.get('负责老师', '')),
                'teacher': safe(row.get('负责老师', ''))
            })

        return jsonify({'success': True, 'students': students, 'total': len(students)})
    except Exception as e:
        return jsonify({'success': False, 'message': f'解析Excel失败：{str(e)}'})


# ============================================================
# 批量认定（审核后确认入库）
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
        create_time = beijing_now()
        success_count = 0

        # 在循环外一次性获取当前最大编号，循环内用本地计数器递增，避免同一事务内重复查读导致编号重复
        with get_db().cursor() as _c:
            _c.execute("SELECT recognition_no FROM students WHERE recognition_no REGEXP '^[0-9]+$' ORDER BY CAST(recognition_no AS UNSIGNED) DESC LIMIT 1")
            _row = _c.fetchone()
        try:
            _last_no = int(_row['recognition_no']) if _row and _row['recognition_no'] else 0
        except Exception:
            _last_no = 0
        next_no = max(_last_no + 1, 2600001)  # 下一个将要分配的编号

        with conn.cursor() as c:
            for s in students:
                try:
                    assigned = s.get('assigned_teacher') or s.get('teacher') or teacher
                    creator = teacher

                    # 认定编号由系统统一自动分配，忽略表格中的原始编号
                    # is_certified=1 或 is_signed=1 均视为需要认定
                    needs_cert = int(s.get('is_certified', 0)) == 1 or int(s.get('is_signed', 0)) == 1
                    if needs_cert:
                        recognition_no = str(next_no)
                        next_no += 1  # 本地递增，下一条记录使用下一个编号
                        is_signed = 1
                    else:
                        recognition_no = ''
                        is_signed = 0

                    c.execute('''INSERT INTO students (
                        name, gender, phone1, phone2, district, school, graduation_year,
                        class_name, grade_total, rank_初一上, rank_初一下, rank_初二上,
                        rank_初二下, rank_初三上期中, rank_初三上期末, score_初三上期末,
                        score_一模, score_二模, test_paper, test_location, math_score,
                        english_score, total_score, evaluation, promised_class, is_signed,
                        reason, score, file_path, remark, recognition_no, assigned_teacher, teacher, createTime
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''', (
                        s.get('name', ''), s.get('gender', ''), s.get('phone1', ''), s.get('phone2', ''),
                        s.get('district', ''), s.get('school', ''), s.get('graduation_year'),
                        s.get('class_name', ''), s.get('grade_total'),
                        s.get('rank_初一上'), s.get('rank_初一下'), s.get('rank_初二上'), s.get('rank_初二下'),
                        s.get('rank_初三上期中'), s.get('rank_初三上期末'),
                        s.get('score_初三上期末', ''), s.get('score_一模', ''), s.get('score_二模', ''),
                        s.get('test_paper', ''), s.get('test_location', ''),
                        s.get('math_score', ''), s.get('english_score', ''), s.get('total_score', ''),
                        s.get('evaluation', ''), s.get('promised_class', ''),
                        is_signed, s.get('reason', ''), s.get('score', ''),
                        s.get('file_path', ''), s.get('remark', ''),
                        recognition_no,
                        assigned, creator, create_time
                    ))
                    success_count += 1
                except Exception:
                    pass
        conn.commit()
        conn.close()
        add_log(teacher, '批量认定', f'{success_count}名学生', f'共提交{len(students)}条')
        return jsonify({'success': True, 'message': f'成功认定 {success_count} 名学生', 'count': success_count})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


# ============================================================
# 试卷管理
# ============================================================
@app.route('/api/exam-papers', methods=['GET'])
def get_exam_papers():
    conn = get_db()
    with conn.cursor() as c:
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
        with conn.cursor() as c:
            c.execute('INSERT INTO exam_papers (title, year, description, file_path, uploader, upload_time) VALUES (%s, %s, %s, %s, %s, %s)',
                      (title, year, description, filename, uploader, upload_time))
            paper_id = c.lastrowid
        conn.commit()
        conn.close()
        add_log(uploader, '上传试卷', title, f"年份：{year}")
        return jsonify({'success': True, 'id': paper_id, 'message': '试卷上传成功'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/exam-papers/<int:paper_id>', methods=['DELETE'])
def delete_exam_paper(paper_id):
    operator_role = request.args.get('operator_role', '')
    operator_name = request.args.get('operator_name', 'admin')
    if operator_role != 'admin':
        return jsonify({'success': False, 'message': '权限不足，仅超级管理员可删除试卷'})
    conn = get_db()
    try:
        with conn.cursor() as c:
            c.execute('SELECT file_path, title FROM exam_papers WHERE id = %s', (paper_id,))
            paper = c.fetchone()
            if paper:
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], paper['file_path'])
                if os.path.exists(filepath):
                    os.remove(filepath)
                add_log(operator_name, '删除试卷', paper['title'], f"ID:{paper_id}")
            c.execute('DELETE FROM exam_papers WHERE id = %s', (paper_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})


# ============================================================
# 认定编号自动生成（26xxxx 格式，自动递增）
# ============================================================
def generate_recognition_no():
    conn = get_db()
    with conn.cursor() as c:
        c.execute("SELECT recognition_no FROM students WHERE recognition_no REGEXP '^[0-9]+$' ORDER BY CAST(recognition_no AS UNSIGNED) DESC LIMIT 1")
        row = c.fetchone()
    conn.close()
    if row and row['recognition_no']:
        try:
            last_num = int(row['recognition_no'])
            next_num = last_num + 1
            # 确保至少7位，从2600001开始
            return str(max(next_num, 2600001))
        except Exception:
            pass
    return '2600001'


# ============================================================
# 超级管理员一键导出所有学生信息
# ============================================================
@app.route('/api/export-all-students', methods=['GET'])
def export_all_students():
    """导出学生信息为 Excel（所有角色均可，teacher只导出自己负责的学生）"""
    operator_role = request.args.get('role', '')
    operator_username = request.args.get('username', '')
    operator_name = request.args.get('name', '')

    if operator_role not in ('admin', 'manager', 'teacher'):
        return jsonify({'success': False, 'message': '权限不足'}), 403

    import io
    conn = get_db()
    with conn.cursor() as c:
        if operator_role == 'teacher':
            # teacher 只导出分配给自己的学生
            c.execute(
                'SELECT * FROM students WHERE assigned_teacher=%s OR assigned_teacher=%s OR teacher=%s OR teacher=%s ORDER BY id ASC',
                (operator_username, operator_name, operator_username, operator_name)
            )
        else:
            c.execute('SELECT * FROM students ORDER BY id ASC')
        students = c.fetchall()
    conn.close()

    rows = []
    for s in students:
        rows.append({
            '学生姓名': s.get('name', ''),
            '性别': s.get('gender', ''),
            '联系电话1': s.get('phone1', ''),
            '联系电话2': s.get('phone2', ''),
            '行政区': s.get('district', ''),
            '初中学校名称': s.get('school', ''),
            '毕业年份': s.get('graduation_year', ''),
            '班级': s.get('class_name', ''),
            '年级总人数': s.get('grade_total', ''),
            '八上期末年级排名': s.get('rank_初一上', ''),
            '八下期末年级排名': s.get('rank_初一下', ''),
            '九上期中年级排名': s.get('rank_初二上', ''),
            '九上期末排名': s.get('rank_初二下', ''),
            '九上期末分数': s.get('score_初三上期末', ''),
            '一模成绩': s.get('score_一模', ''),
            '二模成绩': s.get('score_二模', ''),
            '测试试卷': s.get('test_paper', ''),
            '测试地点': s.get('test_location', ''),
            '数学': s.get('math_score', ''),
            '英语': s.get('english_score', ''),
            '总分': s.get('total_score', ''),
            '评价等级': s.get('evaluation', ''),
            '承诺班型': s.get('promised_class', ''),
            '认定编号': s.get('recognition_no', ''),
            '负责老师': s.get('assigned_teacher') or s.get('teacher', ''),
            '备注': s.get('remark', ''),
        })

    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='学生信息')
        workbook = writer.book
        worksheet = writer.sheets['学生信息']
        header_fmt = workbook.add_format({'bold': True, 'bg_color': '#1a56db', 'font_color': 'white', 'border': 1})
        for col_num, col_name in enumerate(df.columns):
            worksheet.write(0, col_num, col_name, header_fmt)
            worksheet.set_column(col_num, col_num, max(len(str(col_name)) * 2, 12))
    output.seek(0)

    from flask import Response
    from urllib.parse import quote
    filename = f"学生信息导出_{beijing_now().replace(':', '-').replace(' ', '_')}.xlsx"
    encoded_filename = quote(filename, safe='')
    return Response(
        output.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f"attachment; filename=\"export.xlsx\"; filename*=UTF-8''{encoded_filename}"}
    )


# ============================================================
# 旧版直接导入接口（向后兼容）
# ============================================================
@app.route('/api/import-excel', methods=['POST'])
def import_excel():
    """旧版直接导入接口（向后兼容），严格按模板26列解析"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'})
    if file:
        try:
            df = pd.read_excel(file, dtype=str)
            df = df[df['学生姓名'].notna() & (df['学生姓名'].astype(str).str.strip() != '') & (df['学生姓名'].astype(str).str.strip() != 'nan')]
            conn = get_db()
            count = 0
            with conn.cursor() as c:
                for _, row in df.iterrows():
                    def safe(val, default=''):
                        if pd.isna(val): return default
                        s = str(val).strip()
                        return default if s == 'nan' else s
                    def safe_num(val):
                        if pd.isna(val): return None
                        try:
                            v = float(val)
                            return int(v) if v == int(v) else v
                        except Exception: return None
                    recognition_no = safe(row.get('认定编号', ''))
                    create_time = beijing_now()
                    c.execute('''INSERT INTO students (
                        name, gender, phone1, phone2, district, school, graduation_year,
                        class_name, grade_total, rank_初一上, rank_初一下, rank_初二上,
                        rank_初二下, score_初三上期末, score_一模, score_二模,
                        test_paper, test_location, math_score, english_score, total_score,
                        evaluation, promised_class, recognition_no, is_signed,
                        remark, assigned_teacher, teacher, createTime
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''', (
                        safe(row.get('学生姓名', '')), safe(row.get('性别', '')),
                        safe(row.get('联系电话1', '')), safe(row.get('联系电话2', '')),
                        safe(row.get('行政区', '')), safe(row.get('初中学校名称', '')),
                        safe_num(row.get('毕业年份')), safe(row.get('班级', '')),
                        safe_num(row.get('年级总人数')),
                        safe_num(row.get('八上期末年级排名')), safe_num(row.get('八下期末年级排名')),
                        safe_num(row.get('九上期中年级排名')), safe_num(row.get('九上期末排名')),
                        safe(row.get('九上期末分数', '')), safe(row.get('一模成绩', '')), safe(row.get('二模成绩', '')),
                        safe(row.get('测试试卷', '')), safe(row.get('测试地点', '')),
                        safe(row.get('数学', '')), safe(row.get('英语', '')), safe(row.get('总分', '')),
                        safe(row.get('评价等级', '')), safe(row.get('承诺班型', '')),
                        recognition_no, 1 if recognition_no else 0,
                        safe(row.get('备注', '')),
                        safe(row.get('负责老师', '')), safe(row.get('负责老师', '')), create_time
                    ))
                    count += 1
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': f'成功导入 {count} 条数据'})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)})


# 应用启动时初始化数据库
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=False)
