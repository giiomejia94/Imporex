// =========================================================
// productos_admin.js
// Lógica del módulo de administración de productos:
//  - Catálogo con pestañas (igual al del cliente, con botones hover)
//  - Agregar producto (formulario completo + 2 imágenes)
//  - Editar producto (buscador -> formulario precargado)
//  - Eliminar producto (buscador -> confirmación)
// =========================================================

let catalogoAdminActual = {};
let categoriaAdminActiva = "";
let modoFormulario = "agregar"; // 'agregar' o 'editar'
let codigoEnEdicion = null;

// =========================================================
// CARGA DEL CATÁLOGO (sin filtro de tipo, el admin ve todo)
// =========================================================
async function cargarCatalogoAdmin() {
    const cont = document.getElementById("catalogo-admin-contenido");
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><p>Cargando productos...</p></div>`;

    try {
        const response = await fetch(`/api/productos/catalogo`);
        if (!response.ok) throw new Error("No se pudo cargar el catálogo");
        catalogoAdminActual = await response.json();

        const categorias = Object.keys(catalogoAdminActual);
        if (categorias.length === 0) {
            cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No hay productos registrados todavía.</p></div>`;
            return;
        }

        if (!categoriaAdminActiva || !categorias.includes(categoriaAdminActiva)) {
            categoriaAdminActiva = categorias[0];
        }
        renderPestanasAdmin(categorias);
        renderTarjetasAdmin(categoriaAdminActiva);

    } catch (error) {
        console.error(error);
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error al cargar el catálogo.</p></div>`;
    }
}

function renderPestanasAdmin(categorias) {
    const tabs = document.getElementById("catalogo-admin-tabs");
    tabs.innerHTML = categorias.map(cat => `
        <button class="tab-categoria ${cat === categoriaAdminActiva ? 'activa' : ''}" data-categoria="${cat}">
            ${cat}
        </button>
    `).join("");

    tabs.querySelectorAll(".tab-categoria").forEach(btn => {
        btn.addEventListener("click", () => {
            categoriaAdminActiva = btn.dataset.categoria;
            tabs.querySelectorAll(".tab-categoria").forEach(t => t.classList.toggle("activa", t === btn));
            renderTarjetasAdmin(categoriaAdminActiva);
        });
    });
}

function renderTarjetasAdmin(categoria) {
    const cont = document.getElementById("catalogo-admin-contenido");
    const productos = catalogoAdminActual[categoria] || [];

    if (productos.length === 0) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No hay productos en esta categoría.</p></div>`;
        return;
    }

    cont.innerHTML = `<div class="catalogo-grid"></div>`;
    const grid = cont.querySelector(".catalogo-grid");

    productos.forEach(p => {
        const card = document.createElement("div");
        card.className = "producto-card admin-card";
        card.innerHTML = `
            <div class="admin-card-acciones">
                <button class="mini-btn mini-editar" title="Editar">✏️</button>
                <button class="mini-btn mini-eliminar" title="Eliminar">🗑️</button>
            </div>
            <div class="producto-codigo">${p.codigo}</div>
            <div class="producto-imagen">
                ${p.imagen_url ? `<img src="${p.imagen_url}" alt="${p.nombre}">` : '📦'}
            </div>
            <div class="producto-nombre">${p.nombre}</div>
            <div class="producto-presentacion">${p.presentacion || ''}</div>
            <div class="producto-precio">$${Number(p.precio).toFixed(2)} USD</div>
        `;
        card.querySelector(".mini-editar").addEventListener("click", (e) => {
            e.stopPropagation();
            abrirFormulario("editar", p);
        });
        card.querySelector(".mini-eliminar").addEventListener("click", (e) => {
            e.stopPropagation();
            confirmarEliminacion(p);
        });
        grid.appendChild(card);
    });
}

// =========================================================
// BOTÓN "AGREGAR" (header) -> formulario en blanco
// =========================================================
function iniciarAgregar() {
    abrirFormulario("agregar", null);
}

// =========================================================
// BOTÓN "EDITAR" (header) -> abre buscador
// =========================================================
function iniciarEditar() {
    abrirBuscador("editar");
}

// =========================================================
// BOTÓN "ELIMINAR" (header) -> abre buscador
// =========================================================
function iniciarEliminar() {
    abrirBuscador("eliminar");
}

// =========================================================
// BUSCADOR (compartido entre editar y eliminar desde el header)
// =========================================================
function abrirBuscador(modo) {
    document.getElementById("buscadorAdminOverlay").classList.add("visible");
    document.getElementById("buscador-admin-titulo").textContent =
        modo === "editar" ? "Buscar producto para editar" : "Buscar producto para eliminar";
    document.getElementById("buscador-admin-input").value = "";
    document.getElementById("buscador-admin-input").dataset.modo = modo;
    document.getElementById("buscador-admin-resultados").innerHTML = "";
    document.getElementById("buscador-admin-input").focus();
}

function cerrarBuscadorAdmin() {
    document.getElementById("buscadorAdminOverlay").classList.remove("visible");
}

let debounceBuscadorAdmin = null;
function buscarProductoAdmin(input) {
    clearTimeout(debounceBuscadorAdmin);
    const termino = input.value.trim();
    const modo = input.dataset.modo;
    const cont = document.getElementById("buscador-admin-resultados");

    if (termino.length < 1) {
        cont.innerHTML = "";
        return;
    }

    debounceBuscadorAdmin = setTimeout(async () => {
        try {
            const response = await fetch(`/api/productos/buscar-admin?q=${encodeURIComponent(termino)}`);
            const productos = await response.json();
            renderResultadosBuscadorAdmin(productos, modo);
        } catch (error) {
            console.error(error);
        }
    }, 300);
}

function renderResultadosBuscadorAdmin(productos, modo) {
    const cont = document.getElementById("buscador-admin-resultados");
    if (productos.length === 0) {
        cont.innerHTML = `<div class="resultado-vacio">Sin resultados</div>`;
        return;
    }

    cont.innerHTML = productos.map((p, i) => `
        <div class="resultado-item" data-index="${i}">
            <div class="resultado-imagen">${p.imagen_url ? `<img src="${p.imagen_url}">` : '📦'}</div>
            <div class="resultado-info">
                <strong>${p.codigo}</strong> — ${p.nombre}
                <div class="resultado-precio">$${Number(p.precio).toFixed(2)} USD</div>
            </div>
        </div>
    `).join("");

    cont.querySelectorAll(".resultado-item").forEach((el, i) => {
        el.addEventListener("click", () => {
            cerrarBuscadorAdmin();
            if (modo === "editar") {
                abrirFormulario("editar", productos[i]);
            } else {
                confirmarEliminacion(productos[i]);
            }
        });
    });
}

// =========================================================
// CONFIRMAR Y EJECUTAR ELIMINACIÓN
// =========================================================
async function confirmarEliminacion(producto) {
    const confirmar = confirm(`¿Eliminar el producto "${producto.nombre}" (${producto.codigo})? Esta acción no se puede deshacer.`);
    if (!confirmar) return;

    try {
        const response = await fetch(`/api/productos/${producto.codigo}`, { method: "DELETE" });
        const resultado = await response.json();

        if (!response.ok || !resultado.ok) {
            throw new Error(resultado.error || "No se pudo eliminar el producto");
        }

        mostrarToastAdmin("🗑️ Producto eliminado correctamente");
        await cargarCatalogoAdmin();

    } catch (error) {
        alert("Error: " + error.message);
    }
}

// =========================================================
// FORMULARIO DE AGREGAR / EDITAR
// =========================================================
function abrirFormulario(modo, producto) {
    modoFormulario = modo;
    codigoEnEdicion = producto ? producto.codigo : null;

    const form = document.getElementById("formularioProductoOverlay");
    document.getElementById("form-producto-titulo").textContent =
        modo === "agregar" ? "Agregar nuevo producto" : `Editar producto: ${producto.codigo}`;

    // Si es edición, el código no se puede cambiar (es la llave primaria)
    document.getElementById("campo-codigo").disabled = (modo === "editar");
    document.getElementById("campo-codigo").value = producto ? producto.codigo : "";
    document.getElementById("campo-nombre").value = producto ? producto.nombre : "";
    document.getElementById("campo-categoria").value = producto ? producto.categoria : "Despensa";
    document.getElementById("campo-presentacion").value = producto ? (producto.presentacion || "") : "";
    document.getElementById("campo-precio").value = producto ? producto.precio : "";
    document.getElementById("campo-unidad").value = producto ? (producto.unidad_medida || "") : "";
    document.getElementById("campo-peso-pack").value = producto ? (producto.peso_pack || "") : "";
    document.getElementById("campo-cant-tendido").value = producto ? (producto.cantidad_tendido || "") : "";
    document.getElementById("campo-cant-maxima").value = producto ? (producto.cantidad_maxima || "") : "";
    document.getElementById("campo-apto-maritimo").checked = producto ? !!producto.apto_maritimo : true;
    document.getElementById("campo-apto-aereo").checked = producto ? !!producto.apto_aereo : true;

    // Vista previa de imágenes ya existentes (si las hay)
    document.getElementById("preview-imagen-producto").innerHTML = producto && producto.imagen_url
        ? `<img src="${producto.imagen_url}">` : '<span class="preview-vacio">Sin imagen</span>';
    document.getElementById("preview-imagen-estiba").innerHTML = producto && producto.imagen_estiba_url
        ? `<img src="${producto.imagen_estiba_url}">` : '<span class="preview-vacio">Sin imagen</span>';

    document.getElementById("input-imagen-producto").value = "";
    document.getElementById("input-imagen-estiba").value = "";

    form.classList.add("visible");
}

function cerrarFormularioProducto() {
    document.getElementById("formularioProductoOverlay").classList.remove("visible");
}

function previsualizarImagen(input, idPreview) {
    const archivo = input.files[0];
    const preview = document.getElementById(idPreview);
    if (!archivo) return;

    const lector = new FileReader();
    lector.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}">`;
    };
    lector.readAsDataURL(archivo);
}

async function guardarProducto() {
    const codigo = document.getElementById("campo-codigo").value.trim();
    const nombre = document.getElementById("campo-nombre").value.trim();
    const precio = document.getElementById("campo-precio").value;

    if (!codigo || !nombre || !precio) {
        alert("Completa al menos: código, nombre y precio.");
        return;
    }

    const formData = new FormData();
    formData.append("codigo", codigo);
    formData.append("nombre", nombre);
    formData.append("categoria", document.getElementById("campo-categoria").value);
    formData.append("presentacion", document.getElementById("campo-presentacion").value);
    formData.append("precio", precio);
    formData.append("unidad_medida", document.getElementById("campo-unidad").value);
    formData.append("peso_pack", document.getElementById("campo-peso-pack").value);
    formData.append("cantidad_tendido", document.getElementById("campo-cant-tendido").value);
    formData.append("cantidad_maxima", document.getElementById("campo-cant-maxima").value);
    if (document.getElementById("campo-apto-maritimo").checked) formData.append("apto_maritimo", "on");
    if (document.getElementById("campo-apto-aereo").checked) formData.append("apto_aereo", "on");

    const archivoProducto = document.getElementById("input-imagen-producto").files[0];
    const archivoEstiba = document.getElementById("input-imagen-estiba").files[0];
    if (archivoProducto) formData.append("imagen_producto", archivoProducto);
    if (archivoEstiba) formData.append("imagen_estiba", archivoEstiba);

    const btnGuardar = document.getElementById("btn-guardar-producto");
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";

    try {
        const url = modoFormulario === "agregar" ? "/api/productos" : `/api/productos/${codigoEnEdicion}`;
        const method = modoFormulario === "agregar" ? "POST" : "PUT";

        const response = await fetch(url, { method, body: formData });
        const resultado = await response.json();

        if (!response.ok || !resultado.ok) {
            throw new Error(resultado.error || "No se pudo guardar el producto");
        }

        cerrarFormularioProducto();
        mostrarToastAdmin(modoFormulario === "agregar" ? "✅ Producto agregado correctamente" : "✅ Producto actualizado correctamente");
        await cargarCatalogoAdmin();

    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = "Guardar producto";
    }
}

// =========================================================
// TOAST
// =========================================================
function mostrarToastAdmin(mensaje) {
    const t = document.getElementById("toast-admin");
    if (!t) return;
    t.textContent = mensaje;
    t.style.display = "block";
    setTimeout(() => { t.style.display = "none"; }, 3000);
}

// =========================================================
// INICIALIZACIÓN
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    cargarCatalogoAdmin();

    document.getElementById("buscadorAdminOverlay")?.addEventListener("click", function (e) {
        if (e.target === this) cerrarBuscadorAdmin();
    });
    document.getElementById("formularioProductoOverlay")?.addEventListener("click", function (e) {
        if (e.target === this) cerrarFormularioProducto();
    });
});

