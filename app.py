from flask import Flask, render_template, request, redirect, url_for, session, flash, make_response
from flask_mysqldb import MySQL
from flask_bcrypt import Bcrypt

app = Flask(__name__)
app.secret_key = 'tu_clave_secreta'

# Configuración de MySQL
app.config['MYSQL_HOST'] = '127.0.0.1'
app.config['MYSQL_USER'] = 'root'
app.config['MYSQL_PASSWORD'] = ''
app.config['MYSQL_DB'] = 'imporex'

mysql = MySQL(app)
bcrypt = Bcrypt(app)

# Función para agregar cabeceras de no caché
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"  # Deshabilita la caché
    response.headers["Pragma"] = "no-cache"  # Compatibilidad con HTTP/1.0
    response.headers["Expires"] = "0"  # Fecha de expiración en el pasado
    return response

@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('home'))  # Redirige a home si está autenticado
    return redirect(url_for('login'))  # Redirige a login si no está autenticado

@app.route('/login', methods=['GET', 'POST'])
def login():
    
    if request.method == 'POST':
    
        username = request.form['usuario']
        password = request.form['contrasena']    
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        print(hashed_password) 
        
        cur = mysql.connection.cursor()
        cur.execute('SELECT * FROM users WHERE username = %s', (username,))
        user = cur.fetchone()
        
            
        cur.close()
        print("Giio")
        if user and bcrypt.check_password_hash(user[2], password):
            session['username'] = username
        
            return redirect(url_for("home"))  
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
def home():
    if 'username' not in session:
        return redirect(url_for('login'))  
    response = make_response(render_template('home_cliente.html'))
    return add_no_cache_headers(response)  


@app.route('/admin') #endpoint
def admin():
    if 'username' not in session:
        return redirect(url_for('login'))  
    response = make_response(render_template('home_admin.html')) #visual interfaz
    return add_no_cache_headers(response)  

@app.route('/logout',)
def logout():
    session.pop("username", None)
    response = make_response(redirect(url_for('login')))
    return add_no_cache_headers(response)  

@app.route('/example')
def example_view():
    response = make_response(render_template('error.html'))
    return add_no_cache_headers(response)

@app.route('/crearcuenta')
def crearcuenta():
    response = make_response(render_template('registro.html'))
    return add_no_cache_headers(response)

@app.route('/inicio',)
def inicio():
    response = make_response(render_template('home_cliente.html'))
    return add_no_cache_headers(response)  

@app.route('/pedidos_cliente',)
def pedidos_cliente():
    response = make_response(render_template('pedidos_cliente.html'))
    return add_no_cache_headers(response)  

@app.route('/productos_cliente',)
def productos_cliente():
    response = make_response(render_template('productos_cliente.html'))
    return add_no_cache_headers(response)  

@app.route('/pedidos_progra_cliente',)
def pedidos_progra_cliente():
    response = make_response(render_template('pedidos_progra_cliente.html'))
    return add_no_cache_headers(response)  


if __name__ == '__main__':
    app.run(debug=True)

