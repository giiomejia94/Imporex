from flask import Flask, render_template, request, redirect, url_for, session, flash, make_response, jsonify
from flask_mysqldb import MySQL
from flask_mail import Mail, Message 
from flask_bcrypt import Bcrypt
from datetime import datetime, date
from functools import wraps 
from werkzeug.utils import secure_filename
import os
import random 

app = Flask(__name__)
app.secret_key = 'tu_clave_secreta'

# Configuración de MySQL
app.config['MYSQL_HOST'] = '127.0.0.1'
app.config['MYSQL_USER'] = 'root'
app.config['MYSQL_PASSWORD'] = ''
app.config['MYSQL_DB'] = 'imporex'
app.config['MYSQL_CURSORCLASS'] = 'DictCursor'

mysql = MySQL(app)
bcrypt = Bcrypt(app)

# Configuración de Mail 
app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.environ.get('MAIL_USE_TLS', 'True') == 'True'
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER', app.config['MAIL_USERNAME'])

mail = Mail(app)

# Carpeta donde se guardan las imágenes subidas
CARPETA_IMAGENES = os.path.join('static', 'img', 'productos')
EXTENSIONES_PERMITIDAS = {'png', 'jpg', 'jpeg', 'webp'}

# colores para el perfil 
PALETA_COLORES_PALLET = ['#19b37a', '#d63031', '#f0b429', '#7c4dff', '#00b8d9', '#e17055', '#6c5ce7', '#00b894', '#e84393', '#0984e3']

# Carpeta donde se guardan las fotos de perfil
UPLOAD_FOLDER_PERFILES = 'static/uploads/perfiles'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}  

def extension_permitida(filename):
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Función para agregar cabeceras de no caché
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"  # Deshabilita la caché
    response.headers["Pragma"] = "no-cache"  # Compatibilidad con HTTP/1.0
    response.headers["Expires"] = "0"  # Fecha de expiración en el pasado
    return response

def requiere_login(f):
    @wraps(f)
    def decorada(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorada

def requiere_admin(f):
    @wraps(f)
    def decorada(*args, **kwargs):
        if session.get('id_rol') != 2:
            return redirect(url_for('login'))  # o a una página de "no autorizado"
        return f(*args, **kwargs)
    return decorada

@app.route('/')
def index():
    return redirect(url_for('login'))

@app.route('/inicio')
def inicio():
    if 'username' in session:
        return redirect(url_for('home'))  # Redirige a home si está autenticado
    return redirect(url_for('login'))  # Redirige a login si no está autenticado

# ===================== perfil =====================

def extension_permitida(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in EXTENSIONES_PERMITIDAS

def asignar_color_aleatorio(cur, username):
    """Si el usuario no tiene color, le asigna uno libre de la paleta y lo guarda."""
    cur.execute("SELECT color_pallet FROM users WHERE username = %s", (username,))
    actual = cur.fetchone()
    if actual and actual['color_pallet']:
        return actual['color_pallet']

    cur.execute("SELECT color_pallet FROM users WHERE color_pallet IS NOT NULL")
    ocupados = {row['color_pallet'] for row in cur.fetchall()}
    disponibles = [c for c in PALETA_COLORES_PALLET if c not in ocupados]

    if not disponibles:
        return '#607086'  # gris de respaldo si ya no queda ningún color libre

    color = random.choice(disponibles)
    cur.execute("UPDATE users SET color_pallet = %s WHERE username = %s", (color, username))
    return color

@app.route('/api/perfil/colores', methods=['GET'])
def obtener_colores_pallet():
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    cur = mysql.connection.cursor()
    cur.execute("SELECT username, color_pallet FROM users WHERE color_pallet IS NOT NULL")
    ocupados = {row['color_pallet']: row['username'] for row in cur.fetchall()}

    cur.execute("SELECT color_pallet FROM users WHERE username = %s", (session['username'],))
    mi_color = cur.fetchone()['color_pallet']
    cur.close()

    return {
        'paleta': PALETA_COLORES_PALLET,
        'ocupados': ocupados,  # { "#19b37a": "otro_username", ... }
        'mi_color': mi_color
    }, 200


@app.route('/api/perfil/color', methods=['PUT'])
def elegir_color_pallet():
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    data = request.get_json()
    color = data.get('color')

    if color not in PALETA_COLORES_PALLET:
        return {'ok': False, 'error': 'Color no válido'}, 400

    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT username FROM users WHERE color_pallet = %s AND username != %s",
        (color, session['username'])
    )
    if cur.fetchone():
        cur.close()
        return {'ok': False, 'error': 'Ese color ya fue elegido por otro usuario'}, 409

    cur.execute("UPDATE users SET color_pallet = %s WHERE username = %s", (color, session['username']))
    mysql.connection.commit()
    cur.close()
    return {'ok': True}, 200

@app.route('/perfil', methods=['POST'])
@requiere_login
def perfil():
    # Actualizar nombre, correo, password, foto
    nombre  = request.form.get('nombre')
    correo  = request.form.get('correo')
    password = request.form.get('password')

    cur = mysql.connection.cursor()

    if password:
        hashed = bcrypt.generate_password_hash(password).decode('utf-8')
        cur.execute('UPDATE users SET nombre=%s, Correo=%s, password=%s WHERE username=%s',
                    (nombre, correo, hashed, session['username']))
    else:
        cur.execute('UPDATE users SET nombre=%s, Correo=%s WHERE username=%s',
                    (nombre, correo, session['username']))

    mysql.connection.commit()
    cur.close()

    session['nombre'] = nombre
    session['correo'] = correo

    return redirect(request.referrer or url_for('home_admin'))

@app.route('/api/perfil', methods=['GET'])
def obtener_perfil():
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT username, nombre, Correo AS correo, foto_perfil "
        "FROM users WHERE username = %s",
        (session['username'],)
    )
    usuario = cur.fetchone()
    cur.close()

    if not usuario:
        return {'ok': False, 'error': 'Usuario no encontrado'}, 404

    return usuario, 200


@app.route('/api/perfil', methods=['PUT'])
def editar_perfil():
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    data = request.get_json()
    nombre = data.get('nombre', '').strip()
    correo = data.get('correo', '').strip()
    password = data.get('password', '')

    if not nombre or not correo:
        return {'ok': False, 'error': 'Nombre y correo son obligatorios'}, 400

    cur = mysql.connection.cursor()

    if password:
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        cur.execute(
            "UPDATE users SET nombre = %s, Correo = %s, password = %s WHERE username = %s",
            (nombre, correo, hashed_password, session['username'])
        )
    else:
        cur.execute(
            "UPDATE users SET nombre = %s, Correo = %s WHERE username = %s",
            (nombre, correo, session['username'])
        )

    mysql.connection.commit()
    cur.close()

    session['nombre'] = nombre  # para que el "Hola, {{ session['nombre'] }}" del header se actualice
    return {'ok': True}, 200


@app.route('/api/perfil/foto', methods=['POST'])
def subir_foto_perfil():
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    if 'foto' not in request.files:
        return {'ok': False, 'error': 'No se envió ninguna foto'}, 400

    archivo = request.files['foto']

    if archivo.filename == '' or not extension_permitida(archivo.filename):
        return {'ok': False, 'error': 'Formato de imagen no permitido'}, 400

    os.makedirs(UPLOAD_FOLDER_PERFILES, exist_ok=True)

    extension = archivo.filename.rsplit('.', 1)[1].lower()
    nombre_archivo = secure_filename(f"{session['username']}.{extension}")
    ruta_relativa = f"{UPLOAD_FOLDER_PERFILES}/{nombre_archivo}"

    archivo.save(ruta_relativa)

    cur = mysql.connection.cursor()
    cur.execute(
        "UPDATE users SET foto_perfil = %s WHERE username = %s",
        (ruta_relativa, session['username'])
    )
    mysql.connection.commit()
    cur.close()

    session['foto_perfil'] = ruta_relativa 
    return {'ok': True, 'foto_perfil': ruta_relativa}, 200

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['usuario']
        password = request.form['contrasena']

        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM users WHERE username = %s', (username,))
        user = cur.fetchone()
        cur.close()

        if user and bcrypt.check_password_hash(user['password'], password):

            # Usuario sin rol aprobado aún
            if user['id_rol'] is None:
                flash('Tu cuenta está pendiente de aprobación por el administrador.')
                return redirect(url_for('login'))

            session['username'] = username
            session['id_rol'] = user['id_rol']
            session['foto_perfil'] = user['foto_perfil']

            # id_rol 2 = admin, id_rol 1 = cliente
            rol = int(user['id_rol'])

            if rol == 2:
                return redirect(url_for('home_admin'))
            else:
                return redirect(url_for('inicio'))

        else:
            flash('Usuario o contraseña incorrectos')
            return redirect(url_for('error'))

    response = make_response(render_template('login.html'))
    return add_no_cache_headers(response)

@app.route('/error')
def error():
    response = make_response(render_template('error.html'))
    return add_no_cache_headers(response)



@app.route('/registro', methods=['GET', 'POST'])
def register():
    
    if request.method == 'POST':
        
        username = request.form['username']
        nombre = request.form['nombre']
        password = request.form['password']
        correo = request.form['correo']
        
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        print(hashed_password) 

        cur = mysql.connection.cursor()
        cur.execute('INSERT INTO users (username, nombre, password ,correo ) VALUES (%s, %s, %s, %s)', (username, nombre, hashed_password, correo ))
        mysql.connection.commit()
        print("pronto")
        cur.close()

        flash('Registro exitoso. Por favor, inicia sesión.')
        return redirect(url_for('login'))

    response = make_response(render_template('registro.html'))
    return add_no_cache_headers(response)  


@app.route('/home')
@requiere_login
def home():
    if 'username' not in session:
        return redirect(url_for('login'))  
    response = make_response(render_template('home_cliente.html'))
    return add_no_cache_headers(response)  


@app.route('/home_admin')
@requiere_admin
def home_admin():
    if 'username' not in session:
        return redirect(url_for('login'))

    cur = mysql.connection.cursor()

    # usuarios ya activos (con rol asignado)
    cur.execute(
    "SELECT username AS id_usuario, nombre, id_rol, foto_perfil "
    "FROM users WHERE id_rol IS NOT NULL"
)   
    usuarios = cur.fetchall()
    
    # peticiones pendientes (sin rol asignado todavia)
    cur.execute(
        "SELECT username AS id_usuario, nombre, Correo AS correo, fecha_registro "
        "FROM users WHERE id_rol IS NULL"
    )
    peticiones_pendientes = cur.fetchall()

    # junto a las otras queries de home_admin():
    cur.execute(
    "SELECT username AS id_usuario, nombre FROM users WHERE id_rol = 1 ORDER BY nombre ASC"
    )
    clientes = cur.fetchall()

    cur.close()
    response = make_response(render_template(
        'home_admin.html',
        usuarios=usuarios,
        peticiones_pendientes=peticiones_pendientes,
        clientes=clientes
    ))
    return add_no_cache_headers(response)

@app.route('/logout',)
def logout():
    session.clear()
    response = make_response(redirect(url_for('login')))
    return add_no_cache_headers(response)  

@app.route('/crearcuenta', methods=['GET', 'POST'])
def crearcuenta():
    error = None

    if request.method == 'POST':
        username = request.form['username'].strip()
        nombre = request.form['nombre'].strip()
        password = request.form['password']
        correo = request.form.get('correo', '').strip()

        if not correo:
            error = 'El correo es obligatorio para poder notificarte la activación de tu cuenta.'
        else:
            cur = mysql.connection.cursor()
            cur.execute("SELECT username FROM users WHERE username = %s", (username,))
            existente = cur.fetchone()

            if existente:
                error = f"El usuario '{username}' ya existe. Elige otro nombre de usuario."
                cur.close()
            else:
                hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
                cur.execute(
                    "INSERT INTO users (username, nombre, password, Correo, id_rol) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (username, nombre, hashed_password, correo, None)
                )
                mysql.connection.commit()
                cur.close()
                return redirect(url_for('login'))

    response = make_response(render_template(
        'registro.html',
        error=error,
        username_val=request.form.get('username', '') if request.method == 'POST' else '',
        nombre_val=request.form.get('nombre', '') if request.method == 'POST' else '',
        correo_val=request.form.get('correo', '') if request.method == 'POST' else ''
    ))
    return add_no_cache_headers(response)

    response = make_response(render_template(
        'registro.html',
        error=error,
        username_val=request.form.get('username', '') if request.method == 'POST' else '',
        nombre_val=request.form.get('nombre', '') if request.method == 'POST' else '',
        correo_val=request.form.get('correo', '') if request.method == 'POST' else ''
    ))
    return add_no_cache_headers(response)

# ===================== RUTAS DE CLIENTE =====================

@app.route('/pedidos_cliente')
@requiere_login
def pedidos_cliente():
    response = make_response(render_template('pedidos_cliente.html'))
    return add_no_cache_headers(response)


@app.route('/productos_cliente')
@requiere_login
def productos_cliente():
    response = make_response(render_template('productos_cliente.html'))
    return add_no_cache_headers(response)


@app.route('/pedidos_progra_cliente')
@requiere_login
def pedidos_progra_cliente():
    response = make_response(render_template('pedidos_progra_cliente.html'))
    return add_no_cache_headers(response)

# ===================== RUTAS DE ADMIN =====================

@app.route('/pedidos_admin')
@requiere_admin
def pedidos_admin():
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT username AS id_usuario, nombre FROM users WHERE id_rol = 1 ORDER BY nombre ASC"
    )
    clientes = cur.fetchall()
    cur.close()

    response = make_response(render_template('pedidos_admin.html', clientes=clientes))
    return add_no_cache_headers(response)


@app.route('/productos_admin')
@requiere_admin
def productos_admin():
    response = make_response(render_template('productos_admin.html'))
    return add_no_cache_headers(response)

# ===================== pedidos programados =====================

def calcular_iniciales(nombre):
    """G, GM, etc. — a partir del campo 'nombre' (puede ser una o varias palabras)."""
    if not nombre:
        return '?'
    palabras = nombre.strip().split()
    return ''.join(p[0].upper() for p in palabras[:2])


@app.route('/api/pedidos_programados/<int:id_despacho>', methods=['GET'])
def obtener_pedido_programado(id_despacho):
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT id, tipo, fecha_envio, destino, pallets_totales, pallets_disponibles, estado "
        "FROM pedidos_programados WHERE id = %s",
        (id_despacho,)
    )
    despacho = cur.fetchone()
    cur.close()

    if not despacho:
        return {'ok': False, 'error': 'Despacho no encontrado'}, 404

    return despacho, 200


@app.route('/api/pedidos_programados/<int:id_despacho>/pallets', methods=['GET'])
def obtener_pallets_despacho(id_despacho):
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT pp.numero_pallet, pp.cliente_username, u.nombre AS nombre_cliente "
        "FROM pedido_programado_pallets pp "
        "LEFT JOIN users u ON pp.cliente_username = u.username "
        "WHERE pp.id_pedido_programado = %s "
        "ORDER BY pp.numero_pallet ASC",
        (id_despacho,)
    )
    pallets = cur.fetchall()

    resultado = []
    for p in pallets:
        color = None
        if p['cliente_username']:
            color = asignar_color_aleatorio(cur, p['cliente_username'])

        resultado.append({
            'numero_pallet': p['numero_pallet'],
            'ocupado': p['cliente_username'] is not None,
            'es_mio': p['cliente_username'] == session['username'],
            'iniciales': calcular_iniciales(p['nombre_cliente']) if p['cliente_username'] else None,
            'color': color
        })

    mysql.connection.commit()  # por si asignar_color_aleatorio guardó un color nuevo
    cur.close()
    return {'pallets': resultado}, 200


@app.route('/api/pedidos_programados/<int:id_despacho>/participar', methods=['POST'])
def participar_maritimo(id_despacho):
    """Reserva UNA casilla de pallet con UN producto/cantidad (flujo Contenedor)."""
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    data = request.get_json()
    numero_pallet = data.get('numero_pallet')
    codigo_producto = data.get('codigo_producto')
    cantidad = data.get('cantidad')
    username = session['username']

    if not numero_pallet or not codigo_producto or not cantidad:
        return {'ok': False, 'error': 'Datos incompletos'}, 400

    cur = mysql.connection.cursor()

    # 1. Validar que la casilla exista y esté libre
    cur.execute(
        "SELECT cliente_username FROM pedido_programado_pallets "
        "WHERE id_pedido_programado = %s AND numero_pallet = %s",
        (id_despacho, numero_pallet)
    )
    pallet = cur.fetchone()
    if not pallet:
        cur.close()
        return {'ok': False, 'error': 'Pallet no encontrado'}, 404
    if pallet['cliente_username'] is not None:
        cur.close()
        return {'ok': False, 'error': 'Ese pallet ya fue reservado por otro cliente'}, 409

    # 2. Validar cantidad máxima del producto (y obtener el nombre)
    cur.execute("SELECT nombre, cantidad_maxima FROM productos WHERE codigo = %s", (codigo_producto,))
    producto = cur.fetchone()
    if producto and producto['cantidad_maxima'] and int(cantidad) > producto['cantidad_maxima']:
        cur.close()
        return {'ok': False, 'error': f"La cantidad máxima para este producto es {producto['cantidad_maxima']}"}, 400

    # 3. Buscar despacho para copiar tipo/fecha/destino al pedido
    cur.execute(
        "SELECT tipo, fecha_envio, destino FROM pedidos_programados WHERE id = %s",
        (id_despacho,)
    )
    despacho = cur.fetchone()

    # 4. Buscar si el cliente ya tiene un pedido abierto para este despacho, si no, crearlo
    cur.execute(
        "SELECT id FROM pedidos WHERE id_pedido_programado = %s AND cliente_username = %s",
        (id_despacho, username)
    )
    pedido_existente = cur.fetchone()

    if pedido_existente:
        id_pedido = pedido_existente['id']
        cur.execute("UPDATE pedidos SET pallets = pallets + 1 WHERE id = %s", (id_pedido,))
    else:
        cur.execute(
            "INSERT INTO pedidos "
            "(cliente_username, tipo, fecha_envio, destino, orden_compra, pallets, estado, fecha_creacion, id_pedido_programado) "
            "VALUES (%s, %s, %s, %s, NULL, 1, 'Pendiente', NOW(), %s)",
            (username, despacho['tipo'], despacho['fecha_envio'], despacho['destino'], id_despacho)
        )
        id_pedido = cur.lastrowid

    # 5. Línea de producto para ese pallet
    cur.execute(
        "INSERT INTO pedido_productos (pedido_id, codigo_producto, nombre_producto, cantidad, numero_pallet) "
        "VALUES (%s, %s, %s, %s, %s)",
        (id_pedido, codigo_producto, producto['nombre'], cantidad, numero_pallet)
    )

    # 6. Marcar la casilla como ocupada
    cur.execute(
        "UPDATE pedido_programado_pallets "
        "SET cliente_username = %s, id_pedido = %s, fecha_asignacion = NOW() "
        "WHERE id_pedido_programado = %s AND numero_pallet = %s",
        (username, id_pedido, id_despacho, numero_pallet)
    )

    # 7. Descontar disponibilidad del despacho
    cur.execute(
        "UPDATE pedidos_programados SET pallets_disponibles = pallets_disponibles - 1 WHERE id = %s",
        (id_despacho,)
    )

    mysql.connection.commit()
    cur.close()
    return {'ok': True, 'id_pedido': id_pedido}, 200


@app.route('/api/pedidos_programados/<int:id_despacho>/participar_aereo', methods=['POST'])
def participar_aereo(id_despacho):
    """Crea un pedido con varias líneas de producto de una vez (flujo Aéreo, sin pallets)."""
    if 'username' not in session:
        return {'ok': False, 'error': 'No autorizado'}, 401

    data = request.get_json()
    items = data.get('items', [])
    username = session['username']

    if not items:
        return {'ok': False, 'error': 'El carrito está vacío'}, 400

    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT tipo, fecha_envio, destino FROM pedidos_programados WHERE id = %s",
        (id_despacho,)
    )
    despacho = cur.fetchone()
    if not despacho:
        cur.close()
        return {'ok': False, 'error': 'Despacho no encontrado'}, 404

    cur.execute(
        "INSERT INTO pedidos "
        "(cliente_username, tipo, fecha_envio, destino, orden_compra, pallets, estado, fecha_creacion, id_pedido_programado) "
        "VALUES (%s, %s, %s, %s, NULL, NULL, 'Pendiente', NOW(), %s)",
        (username, despacho['tipo'], despacho['fecha_envio'], despacho['destino'], id_despacho)
    )
    id_pedido = cur.lastrowid

    for item in items:
        cur.execute("SELECT nombre FROM productos WHERE codigo = %s", (item['codigo_producto'],))
        producto = cur.fetchone()
        nombre_producto = producto['nombre'] if producto else item.get('nombre', '')

        cur.execute(
            "INSERT INTO pedido_productos (pedido_id, codigo_producto, nombre_producto, cantidad) "
            "VALUES (%s, %s, %s, %s)",
            (id_pedido, item['codigo_producto'], nombre_producto, item['cantidad'])
        )

    mysql.connection.commit()
    cur.close()
    return {'ok': True, 'id_pedido': id_pedido}, 200

@app.route('/pedidos_progra_admin')
@requiere_admin
def pedidos_progra_admin():
    response = make_response(render_template('pedidos_progra_admin.html'))
    return add_no_cache_headers(response)

@app.route('/api/pedidos_programados', methods=['GET'])
@requiere_admin
def listar_pedidos_programados():
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT id, tipo, fecha_envio, destino, pallets_totales, pallets_disponibles, estado "
        "FROM pedidos_programados "
        "ORDER BY fecha_creacion DESC"
    )
    despachos = cur.fetchall()
    despachos_ordenados = sorted(despachos, key=lambda d: d['id'])
    for i, d in enumerate(despachos_ordenados, start=1):
        d['numero_despacho'] = i
    cur.close()

    for d in despachos:
        d['fecha_envio'] = d['fecha_envio'].strftime('%d-%b-%Y')

    return jsonify(despachos), 200

@app.route('/api/pedidos_programados', methods=['POST'])
@requiere_admin
def crear_pedido_programado():
    data = request.get_json()
    tipo = data.get('tipo')
    fecha_envio = data.get('fecha_envio')
    destino = data.get('destino', '').strip()
    pallets_totales = data.get('pallets_totales')

    if tipo not in ('maritimo', 'aereo') or not fecha_envio or not destino or not pallets_totales:
        return {'ok': False, 'error': 'Datos incompletos'}, 400

    cur = mysql.connection.cursor()
    cur.execute(
        "INSERT INTO pedidos_programados "
        "(tipo, fecha_envio, destino, pallets_totales, pallets_disponibles, creado_por) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (tipo, fecha_envio, destino, pallets_totales, pallets_totales, session['username'])
    )
    id_despacho = cur.lastrowid

    # Si es marítimo, se siembran las 20 casillas de pallets vacías
    if tipo == 'maritimo':
        for numero in range(1, 21):
            cur.execute(
                "INSERT INTO pedido_programado_pallets (id_pedido_programado, numero_pallet) "
                "VALUES (%s, %s)",
                (id_despacho, numero)
            )

    mysql.connection.commit()
    cur.close()
    return {'ok': True, 'id': id_despacho}, 201

@app.route('/api/pedidos', methods=['GET'])
def listar_pedidos():
    username_sesion = session.get('username')
    if not username_sesion:
        return {'ok': False, 'error': 'Debes iniciar sesión'}, 401

    es_admin = int(session.get('id_rol', 0)) == 2

    cur = mysql.connection.cursor()

    if es_admin:
        # el admin ve los pedidos de TODOS los clientes (sin los programados, esos van aparte)
        cur.execute("""
            SELECT p.*, u.nombre AS cliente_nombre
            FROM pedidos p
            JOIN users u ON p.cliente_username = u.username
            WHERE p.id_pedido_programado IS NULL
            ORDER BY p.fecha_creacion DESC
        """)
    else:
        # el cliente normal solo ve los suyos, igual que antes
        cur.execute("""
            SELECT p.*, u.nombre AS cliente_nombre
            FROM pedidos p
            JOIN users u ON p.cliente_username = u.username
            WHERE p.cliente_username = %s AND p.id_pedido_programado IS NULL
            ORDER BY p.fecha_creacion DESC
        """, (username_sesion,))

    pedidos_rows = cur.fetchall()

    # Número consecutivo por cliente (el pedido más antiguo de cada uno es el #1)
    pedidos_ordenados_para_contar = sorted(pedidos_rows, key=lambda p: p['fecha_creacion'])
    contador_por_cliente = {}
    for p in pedidos_ordenados_para_contar:
        cliente = p['cliente_username']
        contador_por_cliente[cliente] = contador_por_cliente.get(cliente, 0) + 1
        p['numero_cliente'] = contador_por_cliente[cliente]

    resultado = []
    for ped in pedidos_rows:
        if isinstance(ped.get('fecha_envio'), date):
            ped['fecha_envio'] = ped['fecha_envio'].isoformat()
        if isinstance(ped.get('fecha_creacion'), datetime):
            ped['fecha_creacion'] = ped['fecha_creacion'].isoformat()

        cur.execute("""
            SELECT codigo_producto, nombre_producto, cantidad, fecha_vencimiento
            FROM pedido_productos
            WHERE pedido_id = %s
        """, (ped['id'],))
        productos = cur.fetchall()
        for p in productos:
            if isinstance(p.get('fecha_vencimiento'), date):
                p['fecha_vencimiento'] = p['fecha_vencimiento'].isoformat()

        ped['productos'] = productos
        resultado.append(ped)

    cur.close()
    return jsonify(resultado)

@app.route('/api/pedidos', methods=['POST'])
def guardar_pedido():
    cliente_username = session.get('username')
    if not cliente_username:
        return {'ok': False, 'error': 'Debes iniciar sesión'}, 401

    # FormData se lee con request.form (texto) y request.files (archivos)
    datos = request.form
    productos_json = datos.get('productos', '[]')

    import json
    try:
        productos = json.loads(productos_json)
    except Exception:
        return {'ok': False, 'error': 'Formato de productos inválido'}, 400

    campos_requeridos = ['tipo', 'fecha_envio', 'destino', 'orden_compra']
    faltantes = [c for c in campos_requeridos if not datos.get(c)]
    if faltantes:
        return {'ok': False, 'error': f'Faltan campos: {", ".join(faltantes)}'}, 400

    if not productos:
        return {'ok': False, 'error': 'El pedido debe tener al menos un producto'}, 400

    # Guardar la OC si viene
    archivo_oc_url = None
    archivo_oc = request.files.get('archivo_oc')
    if archivo_oc and archivo_oc.filename:
        carpeta_oc = os.path.join('static', 'oc')
        os.makedirs(carpeta_oc, exist_ok=True)
        nombre_seguro = secure_filename(f"{cliente_username}_{archivo_oc.filename}")
        ruta = os.path.join(carpeta_oc, nombre_seguro)
        archivo_oc.save(ruta)
        archivo_oc_url = f"/static/oc/{nombre_seguro}"

    cur = mysql.connection.cursor()
    try:
        cur.execute("""
            INSERT INTO pedidos
                (cliente_username, tipo, fecha_envio, destino, orden_compra, archivo_oc,
                tipo_contenedor, pallets, observaciones, estado, fecha_creacion)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            cliente_username,
            datos['tipo'],
            datos['fecha_envio'],
            datos['destino'],
            datos['orden_compra'],
            archivo_oc_url,
            datos.get('tipo_contenedor', ''),
            int(datos.get('pallets', 0)),
            datos.get('observaciones', ''),
            'Pendiente',
            datetime.now()
        ))

        pedido_id = cur.lastrowid

        for p in productos:
            cur.execute("""
                INSERT INTO pedido_productos
                    (pedido_id, codigo_producto, nombre_producto, cantidad, fecha_vencimiento, numero_pallet)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (pedido_id, p['codigo'], p['nombre'], p['cantidad'], p.get('vence', None), p.get('numero_pallet', None)))

    except Exception as e:
        mysql.connection.rollback()
        return {'ok': False, 'error': str(e)}, 500
    finally:
        cur.close()

#============ verificacion de productos por pallet ======

@app.route('/api/pedidos/<int:id_pedido>/verificacion', methods=['GET'])
@requiere_admin
def obtener_productos_verificacion(id_pedido):
    cur = mysql.connection.cursor()

    cur.execute(
        "SELECT id, cliente_username, tipo, destino, estado "
        "FROM pedidos WHERE id = %s",
        (id_pedido,)
    )
    pedido = cur.fetchone()
    if not pedido:
        cur.close()
        return {'ok': False, 'error': 'Pedido no encontrado'}, 404

    cur.execute(
        "SELECT id, numero_pallet, codigo_producto, nombre_producto, cantidad, "
        "aprobado, cantidad_verificada, observacion_producto "
        "FROM pedido_productos "
        "WHERE pedido_id = %s "
        "ORDER BY numero_pallet ASC, id ASC",
        (id_pedido,)
    )
    productos = cur.fetchall()
    cur.close()

    return {'pedido': pedido, 'productos': productos}, 200

# ======= aprobar/rechazar un producto ==========

@app.route('/api/pedido_productos/<int:id_producto_linea>/verificar', methods=['POST'])
@requiere_admin
def verificar_producto_pedido(id_producto_linea):
    data = request.get_json()
    aprobado = data.get('aprobado')  # true o false
    cantidad_verificada = data.get('cantidad_verificada')
    observacion = data.get('observacion', '').strip()

    cur = mysql.connection.cursor()
    cur.execute(
        "UPDATE pedido_productos "
        "SET aprobado = %s, cantidad_verificada = %s, observacion_producto = %s "
        "WHERE id = %s",
        (1 if aprobado else 0, cantidad_verificada, observacion, id_producto_linea)
    )
    mysql.connection.commit()
    cur.close()
    return {'ok': True}, 200

# ======= participacion en pedidos programados==========

@app.route('/api/pedidos_programados/<int:id_despacho>/participantes', methods=['GET'])
@requiere_admin
def listar_participantes_despacho(id_despacho):
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT pp.cliente_username, u.nombre AS nombre_cliente, pp.id_pedido, "
        "GROUP_CONCAT(pp.numero_pallet ORDER BY pp.numero_pallet) AS pallets "
        "FROM pedido_programado_pallets pp "
        "JOIN users u ON pp.cliente_username = u.username "
        "WHERE pp.id_pedido_programado = %s AND pp.cliente_username IS NOT NULL "
        "GROUP BY pp.cliente_username, u.nombre, pp.id_pedido",
        (id_despacho,)
    )
    participantes = cur.fetchall()
    cur.close()

    for p in participantes:
        p['pallets'] = [int(n) for n in p['pallets'].split(',')]

    return jsonify(participantes), 200

@app.route('/api/productos/catalogo')
def catalogo_productos():
    tipo_pedido = request.args.get('tipo', '')  # 'maritimo' o 'aereo', viene del frontend

    cur = mysql.connection.cursor()

    if tipo_pedido == 'maritimo':
        cur.execute("SELECT * FROM productos WHERE apto_maritimo = 1 ORDER BY categoria, nombre")
    elif tipo_pedido == 'aereo':
        cur.execute("SELECT * FROM productos WHERE apto_aereo = 1 ORDER BY categoria, nombre")
    else:
        cur.execute("SELECT * FROM productos ORDER BY categoria, nombre")

    productos = cur.fetchall()
    cur.close()

    # Decimal -> float, porque jsonify no sabe convertir Decimal de MySQL
    for p in productos:
        if p.get('precio') is not None:
            p['precio'] = float(p['precio'])
        if p.get('peso_pack') is not None:
            p['peso_pack'] = float(p['peso_pack'])

    # Agrupar por categoría: así el frontend solo recorre las llaves
    # para pintar las pestañas (Despensa, Bienestar, Hogar...)
    categorias = {}
    for p in productos:
        cat = p['categoria']
        categorias.setdefault(cat, []).append(p)

    return jsonify(categorias)

def extension_permitida(nombre_archivo):
    return '.' in nombre_archivo and nombre_archivo.rsplit('.', 1)[1].lower() in EXTENSIONES_PERMITIDAS


def guardar_imagen(archivo, codigo_producto, sufijo):
    """Guarda un archivo subido y devuelve la ruta relativa para guardar en MySQL."""
    if not archivo or archivo.filename == '':
        return None
    if not extension_permitida(archivo.filename):
        raise ValueError(f'Formato de imagen no permitido: {archivo.filename}')

    extension = archivo.filename.rsplit('.', 1)[1].lower()
    nombre_seguro = secure_filename(f"{codigo_producto}_{sufijo}.{extension}")
    ruta_completa = os.path.join(CARPETA_IMAGENES, nombre_seguro)

    os.makedirs(CARPETA_IMAGENES, exist_ok=True)
    archivo.save(ruta_completa)

    # Ruta relativa que se guarda en la base de datos y se usa en <img src="...">
    return f"/static/img/productos/{nombre_seguro}"


@app.route('/api/productos', methods=['POST'])
@requiere_admin
def crear_producto():
    # request.form trae los campos de texto, request.files trae las imágenes
    datos = request.form

    campos_requeridos = ['codigo', 'nombre', 'categoria', 'precio']
    faltantes = [c for c in campos_requeridos if not datos.get(c)]
    if faltantes:
        return {'ok': False, 'error': f'Faltan campos: {", ".join(faltantes)}'}, 400

    codigo = datos['codigo'].strip()

    cur = mysql.connection.cursor()
    try:
        # Verificar que el código no exista ya
        cur.execute("SELECT codigo FROM productos WHERE codigo = %s", (codigo,))
        if cur.fetchone():
            return {'ok': False, 'error': f'Ya existe un producto con el código {codigo}'}, 400

        # Guardar las imágenes (si vinieron) ANTES de insertar, para tener las rutas listas
        imagen_url = guardar_imagen(request.files.get('imagen_producto'), codigo, 'producto')
        imagen_estiba_url = guardar_imagen(request.files.get('imagen_estiba'), codigo, 'estiba')

        cur.execute("""
            INSERT INTO productos
                (codigo, nombre, categoria, imagen_url, imagen_estiba_url, presentacion,
                precio, unidad_medida, peso_pack, cantidad_tendido, cantidad_maxima,
                apto_maritimo, apto_aereo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            codigo,
            datos['nombre'],
            datos['categoria'],
            imagen_url,
            imagen_estiba_url,
            datos.get('presentacion', ''),
            float(datos['precio']),
            datos.get('unidad_medida', ''),
            float(datos.get('peso_pack') or 0),
            int(datos.get('cantidad_tendido') or 0),
            int(datos.get('cantidad_maxima') or 0),
            1 if datos.get('apto_maritimo') == 'on' else 0,
            1 if datos.get('apto_aereo') == 'on' else 0,
        ))

        mysql.connection.commit()
        return {'ok': True, 'mensaje': 'Producto creado correctamente', 'codigo': codigo}, 201

    except ValueError as e:
        mysql.connection.rollback()
        return {'ok': False, 'error': str(e)}, 400
    except Exception as e:
        mysql.connection.rollback()
        return {'ok': False, 'error': str(e)}, 500
    finally:
        cur.close()


@app.route('/api/productos/<codigo>', methods=['PUT'])
@requiere_admin
def editar_producto(codigo):
    datos = request.form
    cur = mysql.connection.cursor()

    try:
        cur.execute("SELECT * FROM productos WHERE codigo = %s", (codigo,))
        producto_actual = cur.fetchone()
        if not producto_actual:
            return {'ok': False, 'error': 'Producto no encontrado'}, 404

        # Si se subió una imagen nueva, se reemplaza; si no, se conserva la actual
        imagen_url = guardar_imagen(request.files.get('imagen_producto'), codigo, 'producto') \
            or producto_actual['imagen_url']
        imagen_estiba_url = guardar_imagen(request.files.get('imagen_estiba'), codigo, 'estiba') \
            or producto_actual['imagen_estiba_url']

        cur.execute("""
            UPDATE productos SET
                nombre = %s, categoria = %s, imagen_url = %s, imagen_estiba_url = %s,
                presentacion = %s, precio = %s, unidad_medida = %s, peso_pack = %s,
                cantidad_tendido = %s, cantidad_maxima = %s,
                apto_maritimo = %s, apto_aereo = %s
            WHERE codigo = %s
        """, (
            datos['nombre'],
            datos['categoria'],
            imagen_url,
            imagen_estiba_url,
            datos.get('presentacion', ''),
            float(datos['precio']),
            datos.get('unidad_medida', ''),
            float(datos.get('peso_pack') or 0),
            int(datos.get('cantidad_tendido') or 0),
            int(datos.get('cantidad_maxima') or 0),
            1 if datos.get('apto_maritimo') == 'on' else 0,
            1 if datos.get('apto_aereo') == 'on' else 0,
            codigo
        ))

        mysql.connection.commit()
        return {'ok': True, 'mensaje': 'Producto actualizado correctamente'}, 200

    except ValueError as e:
        mysql.connection.rollback()
        return {'ok': False, 'error': str(e)}, 400
    except Exception as e:
        mysql.connection.rollback()
        return {'ok': False, 'error': str(e)}, 500
    finally:
        cur.close()


@app.route('/api/productos/buscar-admin')
@requiere_admin
def buscar_productos_admin():
    termino = request.args.get('q', '').strip()
    cur = mysql.connection.cursor()
    cur.execute("""
        SELECT * FROM productos
        WHERE codigo LIKE %s OR nombre LIKE %s
        ORDER BY nombre
        LIMIT 10
    """, (f'%{termino}%', f'%{termino}%'))
    productos = cur.fetchall()
    cur.close()

    for p in productos:
        if p.get('precio') is not None:
            p['precio'] = float(p['precio'])
        if p.get('peso_pack') is not None:
            p['peso_pack'] = float(p['peso_pack'])

    return jsonify(productos)

@app.route('/api/usuarios', methods=['POST'])
@requiere_admin
def crear_usuario_admin():
    data = request.get_json()
    username = data.get('username', '').strip()
    nombre = data.get('nombre', '').strip()
    correo = data.get('correo', '').strip()
    password = data.get('password', '')
    id_rol = data.get('id_rol')

    if not username or not nombre or not correo or not password:
        return {'ok': False, 'error': 'Todos los campos son obligatorios'}, 400

    cur = mysql.connection.cursor()
    cur.execute("SELECT username FROM users WHERE username = %s", (username,))
    if cur.fetchone():
        cur.close()
        return {'ok': False, 'error': f"El usuario '{username}' ya existe"}, 409

    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    cur.execute(
        "INSERT INTO users (username, nombre, password, Correo, id_rol) "
        "VALUES (%s, %s, %s, %s, %s)",
        (username, nombre, hashed_password, correo, id_rol)
    )
    mysql.connection.commit()
    cur.close()
    return {'ok': True}, 201


@app.route('/api/usuarios/<username>', methods=['GET'])
@requiere_admin
def obtener_usuario(username):
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT username AS id_usuario, nombre, Correo AS correo, id_rol "
        "FROM users WHERE username = %s", (username,)
    )
    usuario = cur.fetchone()
    cur.close()
    if not usuario:
        return {'ok': False, 'error': 'Usuario no encontrado'}, 404
    return usuario, 200

@app.route('/api/usuarios/<username>/aprobar', methods=['POST'])
@requiere_admin
def aprobar_usuario(username):
    data = request.get_json()
    id_rol = data.get('id_rol')

    if id_rol not in ('1', '2', 1, 2):
        return {'ok': False, 'error': 'Rol inválido'}, 400

    cur = mysql.connection.cursor()
    cur.execute("SELECT nombre, Correo AS correo FROM users WHERE username = %s", (username,))
    usuario = cur.fetchone()

    if not usuario:
        cur.close()
        return {'ok': False, 'error': 'Usuario no encontrado'}, 404

    cur.execute("UPDATE users SET id_rol = %s WHERE username = %s", (id_rol, username))
    mysql.connection.commit()
    cur.close()

    rol_nombre = 'Administrador' if str(id_rol) == '2' else 'Cliente'
    enviar_correo_activacion(usuario['correo'], usuario['nombre'], rol_nombre)

    return {'ok': True}, 200

@app.route('/api/usuarios/<username>/rechazar', methods=['POST'])
@requiere_admin
def rechazar_usuario(username):
    cur = mysql.connection.cursor()
    cur.execute("DELETE FROM users WHERE username = %s AND id_rol IS NULL", (username,))
    mysql.connection.commit()
    cur.close()
    return {'ok': True}, 200

def enviar_correo_activacion(destinatario, nombre, rol_nombre):
    """Notifica al usuario que su cuenta fue activada por el admin."""
    if not destinatario:
        return  # correo era opcional en el registro, puede no existir

    try:
        msg = Message(
            subject='Tu cuenta en C.I. IMPOREX ha sido activada',
            recipients=[destinatario],
            body=(
                f'Hola {nombre},\n\n'
                f'Tu cuenta ya fue verificada y activada por el administrador '
                f'con el rol de {rol_nombre}.\n\n'
                f'Ya puedes iniciar sesión en la plataforma.\n\n'
                f'C.I. IMPOREX'
            )
        )
        mail.send(msg)
    except Exception as e:
        app.logger.error(f'Error enviando correo a {destinatario}: {e}')

@app.route('/api/usuarios/<username>', methods=['PUT'])
@requiere_admin
def editar_usuario(username):
    data = request.get_json()
    nombre = data.get('nombre', '').strip()
    correo = data.get('correo', '').strip()
    id_rol = data.get('id_rol')
    password = data.get('password', '')

    cur = mysql.connection.cursor()

    if password:
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        cur.execute(
            "UPDATE users SET nombre = %s, Correo = %s, id_rol = %s, password = %s "
            "WHERE username = %s",
            (nombre, correo, id_rol, hashed_password, username)
        )
    else:
        cur.execute(
            "UPDATE users SET nombre = %s, Correo = %s, id_rol = %s WHERE username = %s",
            (nombre, correo, id_rol, username)
        )

    mysql.connection.commit()
    cur.close()
    return {'ok': True}, 200


@app.route('/api/usuarios/<username>', methods=['DELETE'])
@requiere_admin
def eliminar_usuario(username):
    cur = mysql.connection.cursor()
    cur.execute("DELETE FROM users WHERE username = %s", (username,))
    mysql.connection.commit()
    cur.close()
    return {'ok': True}, 200    

# Endpoints de reserva admin, detalle de pallet y lista de clientes

@app.route('/api/clientes', methods=['GET'])
@requiere_admin
def listar_clientes():
    cur = mysql.connection.cursor()
    cur.execute("SELECT username, nombre FROM users WHERE id_rol = 1 ORDER BY nombre ASC")
    clientes = cur.fetchall()
    cur.close()
    return jsonify(clientes), 200


@app.route('/api/pedidos_programados/<int:id_despacho>/pallets/<int:numero_pallet>/detalle', methods=['GET'])
@requiere_admin
def detalle_pallet(id_despacho, numero_pallet):
    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT pp.id_pedido, pp.comentario_distribucion, u.nombre AS nombre_cliente "
        "FROM pedido_programado_pallets pp "
        "LEFT JOIN users u ON pp.cliente_username = u.username "
        "WHERE pp.id_pedido_programado = %s AND pp.numero_pallet = %s",
        (id_despacho, numero_pallet)
    )
    pallet = cur.fetchone()

    if not pallet or not pallet['id_pedido']:
        cur.close()
        return {'ok': False, 'error': 'Este pallet está libre'}, 404

    cur.execute(
        "SELECT pr.codigo_producto, p.nombre_producto, pr.cantidad "
        "FROM pedido_productos pr "
        "WHERE pr.pedido_id = %s AND pr.numero_pallet = %s",
        (pallet['id_pedido'], numero_pallet)
    )
    productos = cur.fetchall()
    cur.close()

    return {
        'ok': True,
        'nombre_cliente': pallet['nombre_cliente'],
        'comentario': pallet['comentario_distribucion'],
        'productos': productos
    }, 200


@app.route('/api/pedidos_programados/<int:id_despacho>/admin_reservar', methods=['POST'])
@requiere_admin
def admin_reservar_pallet(id_despacho):
    data = request.get_json()
    numero_pallet = data.get('numero_pallet')
    cliente_username = data.get('cliente_username')
    comentario = data.get('comentario', '').strip()
    items = data.get('items', [])

    if not numero_pallet or not cliente_username or not items:
        return {'ok': False, 'error': 'Datos incompletos'}, 400

    cur = mysql.connection.cursor()

    # 1. Validar que el pallet esté libre
    cur.execute(
        "SELECT cliente_username FROM pedido_programado_pallets "
        "WHERE id_pedido_programado = %s AND numero_pallet = %s",
        (id_despacho, numero_pallet)
    )
    pallet = cur.fetchone()
    if not pallet:
        cur.close()
        return {'ok': False, 'error': 'Pallet no encontrado'}, 404
    if pallet['cliente_username'] is not None:
        cur.close()
        return {'ok': False, 'error': 'Ese pallet ya está reservado'}, 409

    # 2. Datos del despacho
    cur.execute(
        "SELECT tipo, fecha_envio, destino FROM pedidos_programados WHERE id = %s",
        (id_despacho,)
    )
    despacho = cur.fetchone()

    # 3. Buscar o crear el pedido de ese cliente para este despacho
    cur.execute(
        "SELECT id FROM pedidos WHERE id_pedido_programado = %s AND cliente_username = %s",
        (id_despacho, cliente_username)
    )
    pedido_existente = cur.fetchone()

    if pedido_existente:
        id_pedido = pedido_existente['id']
        cur.execute("UPDATE pedidos SET pallets = pallets + 1 WHERE id = %s", (id_pedido,))
    else:
        cur.execute(
            "INSERT INTO pedidos "
            "(cliente_username, tipo, fecha_envio, destino, orden_compra, pallets, estado, fecha_creacion, id_pedido_programado) "
            "VALUES (%s, %s, %s, %s, NULL, 1, 'Pendiente', NOW(), %s)",
            (cliente_username, despacho['tipo'], despacho['fecha_envio'], despacho['destino'], id_despacho)
        )
        id_pedido = cur.lastrowid

    # 4. Insertar cada producto del pallet
    for item in items:
        cur.execute("SELECT nombre FROM productos WHERE codigo = %s", (item['codigo_producto'],))
        producto = cur.fetchone()
        nombre_producto = producto['nombre'] if producto else item.get('nombre', '')

        cur.execute(
            "INSERT INTO pedido_productos (pedido_id, codigo_producto, nombre_producto, cantidad, numero_pallet) "
            "VALUES (%s, %s, %s, %s, %s)",
            (id_pedido, item['codigo_producto'], nombre_producto, item['cantidad'], numero_pallet)
        )

    # 5. Marcar el pallet como ocupado + comentario
    cur.execute(
        "UPDATE pedido_programado_pallets "
        "SET cliente_username = %s, id_pedido = %s, comentario_distribucion = %s, fecha_asignacion = NOW() "
        "WHERE id_pedido_programado = %s AND numero_pallet = %s",
        (cliente_username, id_pedido, comentario, id_despacho, numero_pallet)
    )

    # 6. Descontar disponibilidad
    cur.execute(
        "UPDATE pedidos_programados SET pallets_disponibles = pallets_disponibles - 1 WHERE id = %s",
        (id_despacho,)
    )

    mysql.connection.commit()
    cur.close()
    return {'ok': True, 'id_pedido': id_pedido}, 200

#====== eliminar pedidos=========# 

@app.route('/api/pedidos/<int:id_pedido>', methods=['DELETE'])
@requiere_admin
def eliminar_pedido(id_pedido):
    cur = mysql.connection.cursor()
    try:
        # Si este pedido venía de un despacho programado, liberar su(s) pallet(s)
        cur.execute(
            "SELECT id_pedido_programado FROM pedidos WHERE id = %s",
            (id_pedido,)
        )
        pedido = cur.fetchone()

        if pedido and pedido['id_pedido_programado']:
            id_despacho = pedido['id_pedido_programado']

            cur.execute(
                "SELECT COUNT(*) AS cantidad FROM pedido_programado_pallets "
                "WHERE id_pedido = %s",
                (id_pedido,)
            )
            cantidad_pallets = cur.fetchone()['cantidad']

            cur.execute(
                "UPDATE pedido_programado_pallets "
                "SET cliente_username = NULL, id_pedido = NULL, "
                "comentario_distribucion = NULL, fecha_asignacion = NULL "
                "WHERE id_pedido = %s",
                (id_pedido,)
            )

            if cantidad_pallets > 0:
                cur.execute(
                    "UPDATE pedidos_programados "
                    "SET pallets_disponibles = pallets_disponibles + %s "
                    "WHERE id = %s",
                    (cantidad_pallets, id_despacho)
                )

        cur.execute("DELETE FROM pedido_productos WHERE pedido_id = %s", (id_pedido,))
        cur.execute("DELETE FROM pedidos WHERE id = %s", (id_pedido,))

        mysql.connection.commit()
        return {'ok': True}, 200
    except Exception as e:
        mysql.connection.rollback()
        return {'ok': False, 'error': str(e)}, 500
    finally:
        cur.close()


@app.route('/api/pedidos_programados/<int:id_despacho>', methods=['DELETE'])
@requiere_admin
def eliminar_pedido_programado(id_despacho):
    cur = mysql.connection.cursor()
    try:
        # 1. Traer los pedidos de los clientes que participaron
        cur.execute(
            "SELECT id FROM pedidos WHERE id_pedido_programado = %s",
            (id_despacho,)
        )
        pedidos_participantes = cur.fetchall()

        # 2. Borrar los productos de cada uno de esos pedidos
        for p in pedidos_participantes:
            cur.execute("DELETE FROM pedido_productos WHERE pedido_id = %s", (p['id'],))

        # 3. Borrar las casillas de pallet PRIMERO (liberan la referencia a "pedidos")
        cur.execute(
            "DELETE FROM pedido_programado_pallets WHERE id_pedido_programado = %s",
            (id_despacho,)
        )

        # 4. Ahora sí, borrar los pedidos de los participantes
        cur.execute("DELETE FROM pedidos WHERE id_pedido_programado = %s", (id_despacho,))

        # 5. Borrar el despacho
        cur.execute("DELETE FROM pedidos_programados WHERE id = %s", (id_despacho,))

        mysql.connection.commit()
        return {'ok': True}, 200
    except Exception as e:
        mysql.connection.rollback()
        return {'ok': False, 'error': str(e)}, 500
    finally:
        cur.close()



if __name__ == '__main__':
    app.run(debug=True)

