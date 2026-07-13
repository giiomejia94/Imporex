// =========================================================
// pedidos.js
// Lógica del módulo de pedidos del cliente:
//  - Selección de tipo de pedido (marítimo / aéreo)
//  - Catálogo de productos (overlay con pestañas por categoría)
//  - Modal de detalle / estibado (info de pallet, agregar al carrito)
//  - Carrito de productos del pedido en curso
//  - Guardado del pedido en la base de datos (MySQL vía Flask)
//  - Carga e historial de pedidos del cliente
// =========================================================

let pedidos = [];          // historial de pedidos del cliente (desde el servidor)
let tipoSeleccionado = ""; // 'maritimo' o 'aereo'
let catalogoActual = {};   // catálogo agrupado por categoría, cargado del servidor
let categoriaActiva = "";  // pestaña activa del catálogo
let productoEnModal = null;// producto que está abierto en el modal de detalle
let carritoPedido = [];    // productos ya agregados al pedido en curso

const badgeClases = {
    "Verificado": "badge-verificado",
    "Pendiente": "badge-pendiente",
    "En tránsito": "badge-transito",
    "Entregado": "badge-entregado",
    "Con observación": "badge-observacion"
};

// =========================================================
// FORMATO DE FECHAS
// =========================================================
function formatFecha(str) {
    if (!str) return "—";
    const [y, m, d] = str.split("-");
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${parseInt(d)}-${meses[parseInt(m) - 1]}-${y}`;
}

// Ícono según el tipo de pedido activo: 🚢 marítimo / ✈️ aéreo
function iconoTipo() {
    return tipoSeleccionado === "maritimo" ? "🚢" : "✈️";
}
function textoAgregar() {
    return tipoSeleccionado === "maritimo" ? "Agregar al contenedor" : "Agregar al avión";
}

// =========================================================
// SELECCIÓN DE TIPO DE PEDIDO
// =========================================================
function seleccionarTipo(tipo) {
    // Si el cliente cambia de tipo a mitad de camino, el carrito se reinicia,
    // porque productos aptos para contenedor pueden no ser aptos para avión
    if (carritoPedido.length > 0 && tipo !== tipoSeleccionado) {
        const continuar = confirm("Cambiar el tipo de pedido vacía los productos ya agregados. ¿Continuar?");
        if (!continuar) return;
        carritoPedido = [];
    }

    tipoSeleccionado = tipo;
    document.querySelectorAll(".order-box").forEach(b => b.classList.remove("selected"));
    document.getElementById("box-" + tipo).classList.add("selected");

    const form = document.getElementById("formularioPedido");
    form.classList.add("visible");

    const esMar = tipo === "maritimo";
    document.getElementById("form-icon").textContent = esMar ? "🚢" : "✈️";
    document.getElementById("form-titulo").textContent = esMar
        ? "Nuevo Pedido Marítimo (Contenedor)"
        : "Nuevo Pedido Aéreo";
    document.getElementById("tipo-envio-display").value = esMar ? "Marítimo" : "Aéreo";
    document.getElementById("campo-contenedor").style.display = esMar ? "" : "none";
    document.getElementById("label-pallets").textContent = esMar ? "Pallets disponibles" : "Cajas / bultos";

    renderTablaResumen();
    actualizarContadorCarrito();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelarFormulario() {
    document.getElementById("formularioPedido").classList.remove("visible");
    document.querySelectorAll(".order-box").forEach(b => b.classList.remove("selected"));
    tipoSeleccionado = "";
    carritoPedido = [];

    document.getElementById("fecha-envio").value = "";
    document.getElementById("destino").value = "";
    document.getElementById("orden-compra").value = "";
    document.getElementById("tipo-contenedor").value = "";
    document.getElementById("pallets").value = "";
    document.getElementById("observaciones").value = "";

    renderTablaResumen();
    actualizarContadorCarrito();
}

// =========================================================
// CATÁLOGO DE PRODUCTOS (overlay con pestañas)
// =========================================================
function abrirCatalogo() {
    if (!tipoSeleccionado) {
        alert("Primero selecciona el tipo de pedido (Marítimo o Aéreo).");
        return;
    }
    document.getElementById("catalogoOverlay").classList.add("visible");
    cargarCatalogo();
}

function cerrarCatalogo() {
    document.getElementById("catalogoOverlay").classList.remove("visible");
}

async function cargarCatalogo() {
    const cont = document.getElementById("catalogo-contenido");
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><p>Cargando productos...</p></div>`;

    try {
        const response = await fetch(`/api/productos/catalogo?tipo=${tipoSeleccionado}`);
        if (!response.ok) throw new Error("No se pudo cargar el catálogo");
        catalogoActual = await response.json();

        const categorias = Object.keys(catalogoActual);
        if (categorias.length === 0) {
            cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No hay productos disponibles para este tipo de pedido.</p></div>`;
            return;
        }

        categoriaActiva = categorias[0];
        renderPestanas(categorias);
        renderTarjetas(categoriaActiva);

    } catch (error) {
        console.error(error);
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error al cargar el catálogo.</p></div>`;
    }
}

function renderPestanas(categorias) {
    const tabs = document.getElementById("catalogo-tabs");
    tabs.innerHTML = categorias.map(cat => `
        <button class="tab-categoria ${cat === categoriaActiva ? 'activa' : ''}" data-categoria="${cat}">
            ${cat}
        </button>
    `).join("");

    tabs.querySelectorAll(".tab-categoria").forEach(btn => {
        btn.addEventListener("click", () => cambiarCategoria(btn.dataset.categoria));
    });
}

function cambiarCategoria(cat) {
    categoriaActiva = cat;
    document.querySelectorAll(".tab-categoria").forEach(t => {
        t.classList.toggle("activa", t.dataset.categoria === cat);
    });
    renderTarjetas(cat);
}

function renderTarjetas(categoria) {
    const cont = document.getElementById("catalogo-contenido");
    const productos = catalogoActual[categoria] || [];

    if (productos.length === 0) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No hay productos en esta categoría.</p></div>`;
        return;
    }

    cont.innerHTML = `<div class="catalogo-grid"></div>`;
    const grid = cont.querySelector(".catalogo-grid");

    productos.forEach(p => {
        const card = document.createElement("div");
        card.className = "producto-card";
        card.innerHTML = `
            <div class="producto-codigo">${p.codigo}</div>
            <div class="producto-imagen">
                ${p.imagen_url ? `<img src="${p.imagen_url}" alt="${p.nombre}">` : '📦'}
            </div>
            <div class="producto-nombre">${p.nombre}</div>
            <div class="producto-presentacion">${p.presentacion || ''}</div>
            <div class="producto-precio">$${Number(p.precio).toFixed(2)} USD</div>
        `;
        // Evento asignado por JS (no inline) para evitar romper el HTML
        // si el nombre del producto trae comillas u otros caracteres especiales
        card.addEventListener("click", () => abrirDetalleProducto(p));
        grid.appendChild(card);
    });
}

// =========================================================
// MODAL DE DETALLE / ESTIBADO
// =========================================================
function abrirDetalleProducto(producto) {
    productoEnModal = producto;

    document.getElementById("detalle-codigo").textContent = producto.codigo;
    document.getElementById("detalle-imagen").innerHTML = producto.imagen_url
        ? `<img src="${producto.imagen_url}" alt="${producto.nombre}">`
        : '📦';
    document.getElementById("detalle-nombre").textContent = producto.nombre;
    document.getElementById("detalle-presentacion").textContent = producto.presentacion || '—';
    document.getElementById("detalle-precio").textContent = `$${Number(producto.precio).toFixed(2)} USD`;

    document.getElementById("detalle-peso-pack").textContent = producto.peso_pack ? `${producto.peso_pack}kg` : '—';
    document.getElementById("detalle-cant-tendido").textContent = producto.cantidad_tendido ? `${producto.cantidad_tendido} pack` : '—';
    document.getElementById("detalle-cant-maxima").textContent = producto.cantidad_maxima ? `${producto.cantidad_maxima} pack` : '—';

    // El panel de "distribución" cambia de pallet (marítimo) a cajas/avión (aéreo)
    const tituloDistribucion = document.getElementById("titulo-distribucion");
    const visualPallet = document.getElementById("visual-pallet");
    const visualAereo = document.getElementById("visual-aereo");

    if (tipoSeleccionado === "maritimo") {
        tituloDistribucion.textContent = "Distribución pallets";
        visualPallet.style.display = "grid";
        visualAereo.style.display = "none";
    } else {
        tituloDistribucion.textContent = "Distribución por avión";
        visualPallet.style.display = "none";
        visualAereo.style.display = "flex";
    }

    document.getElementById("cantidad-agregar").value = 1;

    const btnAgregar = document.getElementById("btn-agregar-detalle");
    btnAgregar.textContent = `${iconoTipo()} ${textoAgregar()}`;

    document.getElementById("modalDetalleOverlay").classList.add("visible");
}

function cerrarDetalleProducto() {
    document.getElementById("modalDetalleOverlay").classList.remove("visible");
    productoEnModal = null;
}

function agregarAlCarrito() {
    if (!productoEnModal) return;

    const cantidadInput = document.getElementById("cantidad-agregar");
    const cantidad = parseInt(cantidadInput.value) || 1;

    // Si el producto ya estaba en el carrito, solo se suma la cantidad
    const existente = carritoPedido.find(item => item.codigo === productoEnModal.codigo);
    if (existente) {
        existente.cantidadPacks += cantidad;
    } else {
        carritoPedido.push({
            codigo: productoEnModal.codigo,
            nombre: productoEnModal.nombre,
            presentacion: productoEnModal.presentacion,
            cantidadPacks: cantidad,
            pesoPack: Number(productoEnModal.peso_pack) || 0
        });
    }

    cerrarDetalleProducto();
    actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
    const totalItems = carritoPedido.reduce((sum, p) => sum + p.cantidadPacks, 0);
    const btnCarrito = document.getElementById("btn-agregar-productos");
    if (btnCarrito) {
        btnCarrito.innerHTML = totalItems > 0
            ? `${iconoTipo()} Agregar productos <span class="contador-carrito">${totalItems}</span>`
            : `${iconoTipo()} Agregar productos`;
    }
}

// =========================================================
// CONFIRMAR PRODUCTOS: cierra el catálogo y pinta el resumen
// =========================================================
function confirmarProductos() {
    if (carritoPedido.length === 0) {
        const continuar = confirm("No has agregado ningún producto. ¿Cerrar el catálogo igual?");
        if (!continuar) return;
    }
    cerrarCatalogo();
    renderTablaResumen();
}

function renderTablaResumen() {
    const cont = document.getElementById("tabla-resumen-productos");
    const wrapper = document.getElementById("resumen-productos-wrapper");
    if (!wrapper) return;

    if (carritoPedido.length === 0) {
        wrapper.style.display = "none";
        return;
    }

    wrapper.style.display = "block";
    cont.innerHTML = carritoPedido.map((p, i) => `
        <tr>
            <td>${p.codigo}</td>
            <td>${p.nombre}</td>
            <td>${p.presentacion || '—'}</td>
            <td>${p.cantidadPacks} pack(s)</td>
            <td>${(p.cantidadPacks * p.pesoPack).toFixed(1)} kg</td>
            <td><button class="btn-del-row" onclick="quitarDelCarrito(${i})" title="Quitar">×</button></td>
        </tr>
    `).join("");
}

function quitarDelCarrito(index) {
    carritoPedido.splice(index, 1);
    renderTablaResumen();
    actualizarContadorCarrito();
}

// =========================================================
// ENVÍO DEL PEDIDO (guardado real en la base de datos)
// =========================================================
function previsualizarOC(input) {
    const archivo = input.files[0];
    const label = document.getElementById("oc-nombre-archivo");
    label.textContent = archivo ? `📎 ${archivo.name}` : "📎 Ningún archivo seleccionado";
}

// REEMPLAZA tu función enviarPedido() completa por esta:
async function enviarPedido() {
    const fecha = document.getElementById("fecha-envio").value;
    const destino = document.getElementById("destino").value.trim();
    const orden = document.getElementById("orden-compra").value.trim();

    if (!tipoSeleccionado) {
        alert("Selecciona primero el tipo de pedido (Marítimo o Aéreo).");
        return;
    }
    if (!fecha || !destino || !orden) {
        alert("Por favor completa los campos: Fecha de envío, Destino y Orden de compra.");
        return;
    }
    if (carritoPedido.length === 0) {
        alert("Agrega al menos un producto desde el catálogo antes de enviar el pedido.");
        return;
    }

    // Ahora usamos FormData porque hay un archivo (OC) que enviar
    const formData = new FormData();
    formData.append("tipo", tipoSeleccionado === "maritimo" ? "Marítimo" : "Aéreo");
    formData.append("fecha_envio", fecha);
    formData.append("destino", destino);
    formData.append("orden_compra", orden);
    formData.append("tipo_contenedor", document.getElementById("tipo-contenedor").value || "");
    formData.append("pallets", document.getElementById("pallets").value || 0);
    formData.append("observaciones", document.getElementById("observaciones").value || "");
    formData.append("productos", JSON.stringify(carritoPedido.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        cantidad: `${p.cantidadPacks} pack (${(p.cantidadPacks * p.pesoPack).toFixed(1)} kg)`,
        vence: null
    }))));

    const archivoOC = document.getElementById("input-archivo-oc").files[0];
    if (archivoOC) formData.append("archivo_oc", archivoOC);

    const btnEnviar = document.querySelector(".btn-enviar");
    btnEnviar.disabled = true;
    btnEnviar.textContent = "Guardando...";

    try {
        // Ya no enviamos Content-Type: application/json porque es FormData
        const response = await fetch("/api/pedidos", {
            method: "POST",
            body: formData   // sin headers, el navegador pone multipart automáticamente
        });

        const resultado = await response.json();
        if (!response.ok || !resultado.ok) {
            throw new Error(resultado.error || "No se pudo guardar el pedido");
        }

        cancelarFormulario();
        mostrarToast();
        await cargarPedidosDesdeServidor();

    } catch (error) {
        alert("Error al guardar el pedido: " + error.message);
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = "Enviar pedido";
    }
}

// =========================================================
// HISTORIAL: CARGA DESDE EL SERVIDOR Y RENDERIZADO
// =========================================================
async function cargarPedidosDesdeServidor() {
    try {
        const response = await fetch("/api/pedidos");
        if (!response.ok) throw new Error("No se pudo cargar el historial de pedidos");
        pedidos = await response.json();
        aplicarFiltros();
    } catch (error) {
        console.error(error);
        document.getElementById("lista-pedidos").innerHTML =
            `<div class="empty-state"><div class="empty-icon">⚠️</div><p>No se pudo cargar el historial de pedidos.</p></div>`;
    }
}

function renderPedidos(lista) {
    const cont = document.getElementById("lista-pedidos");
    if (lista.length === 0) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No hay pedidos que coincidan con los filtros.</p></div>`;
        return;
    }

    cont.innerHTML = lista.map(p => {
        const icon = p.tipo === "Marítimo" ? "🚢" : "✈️";
        return `
        <div class="pedido-card" onclick="verDetalle(${p.id})">
            <div class="pedido-info">
                <div class="icono-box">
                    <div class="icon-grande">${icon}</div>
                    <span>${p.tipo}</span>
                </div>
                <div class="pedido-detalle">
                    <h4>Pedido #${p.id}</h4>
                    <p>📍 ${p.destino}</p>
                    <p>🛍 ${p.productos.length} producto(s) · OC: ${p.orden_compra}</p>
                </div>
            </div>
            <div class="pedido-meta">
                <div class="fecha">📅 ${formatFecha(p.fecha_envio)}</div>
                <span class="badge ${badgeClases[p.estado] || ''}">${p.estado}</span><br>
                <button class="btn-ver" onclick="event.stopPropagation(); verDetalle(${p.id})">Ver detalle</button>
            </div>
        </div>
    `;
    }).join("");
}

function aplicarFiltros() {
    const tipo = document.getElementById("filtro-tipo").value;
    const estado = document.getElementById("filtro-estado").value;
    const busqueda = document.querySelector(".search").value.toLowerCase();

    const resultado = pedidos.filter(p =>
        (!tipo || p.tipo === tipo) &&
        (!estado || p.estado === estado) &&
        (!busqueda ||
            String(p.id).includes(busqueda) ||
            p.productos.some(pr => pr.nombre_producto.toLowerCase().includes(busqueda)))
    );

    renderPedidos(resultado);
}

function filtrarPedidos() {
    aplicarFiltros();
}

// =========================================================
// MODAL DE DETALLE DE UN PEDIDO YA GUARDADO (historial)
// =========================================================
function verDetalle(id) {
    const p = pedidos.find(x => x.id === id);
    if (!p) return;

    const icon = p.tipo === "Marítimo" ? "🚢" : "✈️";

    document.getElementById("modal-titulo").textContent = `${icon} Pedido #${p.id}`;
    document.getElementById("modal-grid").innerHTML = `
        <div>Tipo: <span>${p.tipo}</span></div>
        <div>Destino: <span>${p.destino}</span></div>
        <div>Fecha envío: <span>${formatFecha(p.fecha_envio)}</span></div>
        <div>Estado: <span class="badge ${badgeClases[p.estado] || ''}">${p.estado}</span></div>
        <div>Contenedor: <span>${p.tipo_contenedor || "—"}</span></div>
        <div>Pallets/bultos: <span>${p.pallets}</span></div>
        <div>Orden de compra: <span>${p.orden_compra}</span></div>
        <div>Observaciones: <span>${p.observaciones || "—"}</span></div>
    `;

    document.getElementById("modal-productos").innerHTML = p.productos.map(pr => `
        <tr>
            <td>${pr.codigo_producto}</td>
            <td>${pr.nombre_producto}</td>
            <td>${pr.cantidad}</td>
            <td>${formatFecha(pr.fecha_vencimiento)}</td>
        </tr>
    `).join("");

    document.getElementById("modalOverlay").classList.add("visible");
}

function cerrarModal() {
    document.getElementById("modalOverlay").classList.remove("visible");
}

// =========================================================
// TOAST DE CONFIRMACIÓN
// =========================================================
function mostrarToast() {
    const t = document.getElementById("toast");
    t.style.display = "block";
    setTimeout(() => { t.style.display = "none"; }, 3500);
}

// =========================================================
// INICIALIZACIÓN
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("modalOverlay");
    if (overlay) {
        overlay.addEventListener("click", function (e) {
            if (e.target === this) cerrarModal();
        });
    }

    const catalogoOverlay = document.getElementById("catalogoOverlay");
    if (catalogoOverlay) {
        catalogoOverlay.addEventListener("click", function (e) {
            if (e.target === this) cerrarCatalogo();
        });
    }

    const detalleOverlay = document.getElementById("modalDetalleOverlay");
    if (detalleOverlay) {
        detalleOverlay.addEventListener("click", function (e) {
            if (e.target === this) cerrarDetalleProducto();
        });
    }

    cargarPedidosDesdeServidor();
});