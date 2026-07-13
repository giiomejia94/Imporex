from flask import Flask, render_template, request, redirect, url_for, session, flash, make_response, jsonify
from flask_mysqldb import MySQL
from flask_bcrypt import Bcrypt
from datetime import datetime, date
from functools import wraps 
from werkzeug.utils import secure_filename
import os

app = Flask(__name__)
app.secret_key = 'tu_clave_secreta'

# Configuración de MySQL
app.config['MYSQL_HOST'] = '127.0.0.1'
app.config['MYSQL_USER'] = 'root'
app.config['MYSQL_PASSWORD'] = '1098762558Gm'
app.config['MYSQL_DB'] = 'imporex'
app.config['MYSQL_CURSORCLASS'] = 'DictCursor'

mysql = MySQL(app)
bcrypt = Bcrypt(app)


# Carpeta donde se guardan las imágenes subidas
CARPETA_IMAGENES = os.path.join('static', 'img', 'productos')
EXTENSIONES_PERMITIDAS = {'png', 'jpg', 'jpeg', 'webp'}

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
        "SELECT username AS id_usuario, nombre, id_rol "
        "FROM users WHERE id_rol IS NOT NULL"
    )
    usuarios = cur.fetchall()
    
    # peticiones pendientes (sin rol asignado todavia)
    cur.execute(
        "SELECT username AS id_usuario, nombre, Correo AS correo, fecha_registro "
        "FROM users WHERE id_rol IS NULL"
    )
    peticiones_pendientes = cur.fetchall()

    # pedidos recientes de todos los clientes
    cur.execute(
        "SELECT p.id, u.nombre AS nombre_cliente, p.tipo, "
        "p.fecha_creacion, p.estado "
        "FROM pedidos p "
        "JOIN users u ON p.cliente_username = u.username "
        "ORDER BY p.fecha_creacion DESC LIMIT 20"
    )
    pedidos_recientes = cur.fetchall()

    cur.close()

    response = make_response(render_template(
        'home_admin.html',
        usuarios=usuarios,
        peticiones_pendientes=peticiones_pendientes,
        pedidos_recientes=pedidos_recientes
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
    response = make_response(render_template('pedidos_admin.html'))
    return add_no_cache_headers(response)


@app.route('/productos_admin')
@requiere_admin
def productos_admin():
    response = make_response(render_template('productos_admin.html'))
    return add_no_cache_headers(response)


@app.route('/pedidos_progra_admin')
@requiere_admin
def pedidos_progra_admin():
    response = make_response(render_template('Pedidos_progra_admin.html'))
    return add_no_cache_headers(response)



@app.route('/api/pedidos', methods=['GET'])
def listar_pedidos():
    cliente_username = session.get('username')
    if not cliente_username:
        return {'ok': False, 'error': 'Debes iniciar sesión'}, 401

    cur = mysql.connection.cursor()

    # Solo trae los pedidos del cliente que tiene la sesión activa
    cur.execute("""
        SELECT * FROM pedidos
        WHERE cliente_username = %s
        ORDER BY fecha_creacion DESC
    """, (cliente_username,))
    pedidos_rows = cur.fetchall()

    resultado = []
    for ped in pedidos_rows:
        # Las fechas de MySQL llegan como objetos date/datetime de Python,
        # y jsonify no sabe convertirlos solo a texto
        if isinstance(ped.get('fecha_envio'), date):
            ped['fecha_envio'] = ped['fecha_envio'].isoformat()
        if isinstance(ped.get('fecha_creacion'), datetime):
            ped['fecha_creacion'] = ped['fecha_creacion'].isoformat()

        # Por cada pedido, traer también sus productos asociados
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
                    (pedido_id, codigo_producto, nombre_producto, cantidad, fecha_vencimiento)
                VALUES (%s, %s, %s, %s, %s)
            """, (pedido_id, p['codigo'], p['nombre'], p['cantidad'], p.get('vence', None)))

        mysql.connection.commit()
        return {'ok': True, 'mensaje': 'Pedido guardado correctamente', 'pedido_id': pedido_id}, 201

    except Exception as e:
        mysql.connection.rollback()
        return {'ok': False, 'error': str(e)}, 500
    finally:
        cur.close()

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


@app.route('/api/productos/<codigo>', methods=['DELETE'])
@requiere_admin
def eliminar_producto(codigo):
    cur = mysql.connection.cursor()
    try:
        cur.execute("DELETE FROM productos WHERE codigo = %s", (codigo,))
        mysql.connection.commit()

        if cur.rowcount == 0:
            return {'ok': False, 'error': 'Producto no encontrado'}, 404

        return {'ok': True, 'mensaje': 'Producto eliminado correctamente'}, 200

    except Exception as e:
        mysql.connection.rollback()
        # Esto pasa si el producto ya está referenciado en pedido_productos
        return {'ok': False, 'error': 'No se puede eliminar: el producto ya está en pedidos existentes'}, 409
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

if __name__ == '__main__':
    app.run(debug=True)

