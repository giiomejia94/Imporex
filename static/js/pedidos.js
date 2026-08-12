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
    const btnEnviarAereo = document.getElementById('btn-enviar-participacion-aerea');
if (btnEnviarAereo) {
    btnEnviarAereo.style.display = (modoParticipacion && modoParticipacion.tipo === 'aereo') ? 'inline-block' : 'none';
}
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

    // NUEVO: apto para remonte
    document.getElementById("detalle-apto-remonte").textContent = producto.apto_remonte ? '✅ Sí' : '❌ No';

    const tituloDistribucion = document.getElementById("titulo-distribucion");
    const visualPallet = document.getElementById("visual-pallet");
    const visualAereo = document.getElementById("visual-aereo");
    const imagenEstiba = document.getElementById("imagen-estiba");

    if (tipoSeleccionado === "maritimo") {
        tituloDistribucion.textContent = "Distribución pallets";
        visualAereo.style.display = "none";

        // NUEVO: si el admin subió una imagen real de estiba, se usa esa;
        // si no, se muestra el mockup genérico de siempre
        if (producto.imagen_estiba_url) {
            imagenEstiba.src = producto.imagen_estiba_url;
            imagenEstiba.style.display = "block";
            visualPallet.style.display = "none";
        } else {
            imagenEstiba.style.display = "none";
            visualPallet.style.display = "grid";
        }
    } else {
        tituloDistribucion.textContent = "Distribución por avión";
        visualPallet.style.display = "none";
        imagenEstiba.style.display = "none";
        visualAereo.style.display = "flex";
    }

    // NUEVO: limitar la cantidad al máximo permitido para este producto
    const inputCantidad = document.getElementById("cantidad-agregar");
    inputCantidad.value = 1;
    if (producto.cantidad_maxima) {
        inputCantidad.max = producto.cantidad_maxima;
        inputCantidad.oninput = () => {
            if (parseInt(inputCantidad.value) > producto.cantidad_maxima) {
                inputCantidad.value = producto.cantidad_maxima;
            }
        };
    } else {
        inputCantidad.removeAttribute("max");
        inputCantidad.oninput = null;
    }

    // NUEVO: checkbox de "dejar pallet abierto" — solo aplica si estamos
    // en el flujo de pallet propio (no en "suelto", no en participación compartida, no en aéreo)
    const controlDejarAbierto = document.getElementById("control-dejar-abierto");
    const checkDejarAbierto = document.getElementById("dejar-pallet-abierto");

    const aplicaPalletPropio = (typeof palletSeleccionadoPropio !== 'undefined')
        && palletSeleccionadoPropio !== null
        && palletSeleccionadoPropio !== 'suelto'
        && tipoSeleccionado === 'maritimo';

    if (aplicaPalletPropio) {
        controlDejarAbierto.style.display = "block";
        // sugerencia según lo que definió el admin, pero el cliente puede cambiarla
        checkDejarAbierto.checked = !!producto.apto_remonte;
    } else {
        controlDejarAbierto.style.display = "none";
    }

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

    if (productoEnModal.cantidad_maxima && cantidad > productoEnModal.cantidad_maxima) {
        alert(`La cantidad máxima permitida para este producto es ${productoEnModal.cantidad_maxima} pack(s).`);
        return;
    }
    // ======= modo participación en pedido programado (marítimo) =======
    
    if (modoParticipacion && modoParticipacion.tipo === 'maritimo') {
        fetch(`/api/pedidos_programados/${modoParticipacion.idPedidoProgramado}/participar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                numero_pallet: modoParticipacion.numeroPallet,
                codigo_producto: productoEnModal.codigo,
                cantidad: cantidad
            })
        })
        .then(resp => {
            if (!resp.ok) throw new Error('No se pudo reservar el pallet');
            return resp.json();
        })
        .then(() => {
            cerrarDetalleProducto();
            mostrarToastParticipacion('Pallet reservado, pendiente de verificación');
            modoParticipacion.numeroPallet = null;
            abrirModalPallets(modoParticipacion.idPedidoProgramado);
        })
        .catch(() => mostrarToastParticipacion('Error al reservar el pallet', true));
        return;
    }
    // ======= FIN modo participación =======

    // ======= NUEVO: modo "pallet propio" al crear un pedido marítimo normal =======
    if (palletSeleccionadoPropio !== null) {
        const existente = carritoPedido.find(item =>
            item.codigo === productoEnModal.codigo && item.numeroPallet === palletSeleccionadoPropio
        );
        if (existente) {
            existente.cantidadPacks += cantidad;
        } else {
            carritoPedido.push({
                codigo: productoEnModal.codigo,
                nombre: productoEnModal.nombre,
                presentacion: productoEnModal.presentacion,
                cantidadPacks: cantidad,
                pesoPack: Number(productoEnModal.peso_pack) || 0,
                numeroPallet: palletSeleccionadoPropio === 'suelto' ? null : palletSeleccionadoPropio,
                dejarAbierto: document.getElementById("dejar-pallet-abierto").checked
            });
        }
        cerrarDetalleProducto();
        renderTablaResumen();
        actualizarContadorCarrito();
        palletSeleccionadoPropio = null;
        abrirSelectorPalletsPropio(); // vuelve a mostrar el grid para elegir otro pallet
        return;
    }
    // ======= FIN NUEVO =======

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
            pesoPack: Number(productoEnModal.peso_pack) || 0,
            numeroPallet: palletSeleccionadoPropio === 'suelto' ? null : palletSeleccionadoPropio,
            dejarAbierto: document.getElementById("dejar-pallet-abierto").checked
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
// PARTICIPACIÓN EN PEDIDOS PROGRAMADOS
// =========================================================
let modoParticipacion = null; // { idPedidoProgramado, tipo, numeroPallet }

async function participar(idPedidoProgramado) {
    try {
        const resp = await fetch(`/api/pedidos_programados/${idPedidoProgramado}`);
        if (!resp.ok) throw new Error('No se pudo cargar el despacho');
        const despacho = await resp.json();

        tipoSeleccionado = despacho.tipo; // variable ya existente en tu pedido.js
        modoParticipacion = { idPedidoProgramado, tipo: despacho.tipo, numeroPallet: null };

        if (despacho.tipo === 'maritimo') {
            abrirModalPallets(idPedidoProgramado);
        } else {
            carritoPedido.length = 0; // limpio el carrito por si venía de un pedido anterior
            abrirCatalogo();
        }
    } catch (err) {
        mostrarToastParticipacion('No se pudo abrir el despacho', true);
    }
}

async function abrirModalPallets(idPedidoProgramado) {
    try {
        const resp = await fetch(`/api/pedidos_programados/${idPedidoProgramado}/pallets`);
        if (!resp.ok) throw new Error('Error al cargar pallets');
        const data = await resp.json();
        renderGridPallets(data.pallets, idPedidoProgramado);
        document.getElementById('modalPalletsOverlay').classList.add('visible');
    } catch (err) {
        mostrarToastParticipacion('No se pudieron cargar los pallets', true);
    }
}

function renderGridPallets(pallets, idPedidoProgramado) {
    const cont = document.getElementById('grid-pallets-container');

    cont.innerHTML = pallets.map(p => {
        let clase = 'pallet-slot';
        clase += p.ocupado ? ' ocupado' : ' libre';
        if (p.es_mio) clase += ' mio';
        const estilo = p.ocupado ? `style="background:${p.color};"` : '';
        return `<div class="${clase}" ${estilo} data-numero="${p.numero_pallet}">${p.ocupado ? p.iniciales : ''}</div>`;
    }).join('');

    cont.querySelectorAll('.pallet-slot.libre').forEach(slot => {
        slot.addEventListener('click', () => {
            modoParticipacion.numeroPallet = parseInt(slot.dataset.numero);
            document.getElementById('modalPalletsOverlay').classList.remove('visible');
            abrirCatalogo();
        });
    });
}
async function finalizarParticipacionAerea() {
    if (!modoParticipacion || carritoPedido.length === 0) {
        mostrarToastParticipacion('Agrega al menos un producto antes de enviar', true);
        return;
    }

    const items = carritoPedido.map(p => ({ codigo_producto: p.id, cantidad: p.cantidadPacks }));

    try {
        const resp = await fetch(`/api/pedidos_programados/${modoParticipacion.idPedidoProgramado}/participar_aereo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        if (!resp.ok) throw new Error('Error al enviar');

        mostrarToastParticipacion('Participación registrada, pendiente de verificación del admin');
        carritoPedido.length = 0;
        modoParticipacion = null;
        cerrarCatalogo();
        setTimeout(() => location.reload(), 1000);
    } catch (err) {
        mostrarToastParticipacion('No se pudo enviar la participación', true);
    }
}

function mostrarToastParticipacion(mensaje, esError = false) {
    const toast = document.getElementById('toast');
    if (!toast) { alert(mensaje); return; }
    toast.textContent = mensaje;
    toast.style.background = esError ? '#d63031' : '#1f3558';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const btnCerrarPallets = document.getElementById('btnCerrarModalPallets');
    if (btnCerrarPallets) {
        btnCerrarPallets.addEventListener('click', () => {
            document.getElementById('modalPalletsOverlay').classList.remove('visible');
        });
    }
});

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
            <td>${p.numeroPallet ? 'Pallet ' + p.numeroPallet : 'Suelto'}</td>
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

    // Contamos cuántos pallets distintos se usaron (para el campo "pallets" en pedidos)
    const palletsUsados = new Set(
        carritoPedido.filter(p => p.numeroPallet).map(p => p.numeroPallet)
    ).size;

    const formData = new FormData();
    formData.append("tipo", tipoSeleccionado === "maritimo" ? "Marítimo" : "Aéreo");
    formData.append("fecha_envio", fecha);
    formData.append("destino", destino);
    formData.append("orden_compra", orden);
    formData.append("tipo_contenedor", document.getElementById("tipo-contenedor").value || "");
    formData.append("pallets", palletsUsados);
    formData.append("observaciones", document.getElementById("observaciones").value || "");
    formData.append("productos", JSON.stringify(carritoPedido.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        cantidad: `${p.cantidadPacks} pack (${(p.cantidadPacks * p.pesoPack).toFixed(1)} kg)`,
        vence: null,
        numero_pallet: p.numeroPallet || null
    }))));

    const archivoOC = document.getElementById("input-archivo-oc").files[0];
    if (archivoOC) formData.append("archivo_oc", archivoOC);

    const btnEnviar = document.querySelector(".btn-enviar");
    btnEnviar.disabled = true;
    btnEnviar.textContent = "Guardando...";

    try {
        const response = await fetch("/api/pedidos", {
            method: "POST",
            body: formData
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

let palletSeleccionadoPropio = null; // número 1-20, o 'suelto'

function abrirSelectorPalletsPropio() {
    if (tipoSeleccionado !== 'maritimo') {
        abrirCatalogo();
        return;
    }
    const cont = document.getElementById('grid-pallets-propio');
    let html = '';
    for (let numero = 1; numero <= 20; numero++) {
        const itemsDelPallet = carritoPedido.filter(item => item.numeroPallet === numero);
        const tieneProductos = itemsDelPallet.length > 0;
        // el pallet queda cerrado si el ÚLTIMO producto agregado ahí decidió no dejarlo abierto
        const ultimoItem = itemsDelPallet[itemsDelPallet.length - 1];
        const cerrado = tieneProductos && ultimoItem && !ultimoItem.dejarAbierto;
        let clase = 'libre';
        let contenido = numero;
        let bloqueado = false;
        if (tieneProductos) {
            if (cerrado) {
                clase = 'cerrado';
                contenido = '🔒';
                bloqueado = true;
            } else {
                clase = 'con-productos';
                contenido = '✓';
            }
        }
        html += `<div class="pallet-slot ${clase}" data-numero="${numero}" ${bloqueado ? 'data-bloqueado="1"' : ''}>${contenido}</div>`;
    }
    cont.innerHTML = html;
    cont.querySelectorAll('.pallet-slot:not([data-bloqueado])').forEach(slot => {
        slot.addEventListener('click', () => {
            palletSeleccionadoPropio = parseInt(slot.dataset.numero);
            document.getElementById('modalSelectorPalletsPropio').classList.remove('visible');
            abrirCatalogo();
        });
    });
    document.getElementById('modalSelectorPalletsPropio').classList.add('visible');
}

function agregarProductoSuelto() {
    palletSeleccionadoPropio = 'suelto';
    document.getElementById('modalSelectorPalletsPropio').classList.remove('visible');
    abrirCatalogo();
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
    const listaLimitada = lista.slice(0, 4);

    if (listaLimitada.length === 0) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No hay pedidos que coincidan con los filtros.</p></div>`;
        return;
    }

    cont.innerHTML = listaLimitada.map(p => {
        const icon = p.tipo.toLowerCase().includes('mar')
            ? `<img src="/static/img/icon_contenedor.png" alt="Marítimo" class="order-icon">`
            : `<img src="/static/img/icon_aereo.png" alt="Aéreo" class="order-icon">`;
        return `
            <div class="pedido-card" onclick="verDetalle(${p.id})">
                <button class="btn-borrar-tarjeta" onclick="event.stopPropagation(); eliminarPedido(${p.id})" title="Eliminar">×</button>
                <div class="pedido-info">
                    <div class="icono-box">
                        <div class="icon-grande">${icon}</div>
                        <span>${p.tipo}</span>
                    </div>
                    <div class="pedido-detalle">
                        <h4>${p.cliente_nombre} — Pedido #${p.numero_cliente}</h4>
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
    }).join("") + `
        <div style="text-align:center; margin-top:10px;">
            <a href="/pedidos_admin" class="btn-login" style="text-decoration:none; padding:8px 20px; display:inline-block;">Ver todos los pedidos →</a>
        </div>
    `;
}

function aplicarFiltros() {
    const cliente = document.getElementById("filtro-cliente").value;
    const tipo = document.getElementById("filtro-tipo").value;
    const estado = document.getElementById("filtro-estado").value;
    const busqueda = document.querySelector(".search").value.toLowerCase();

    const resultado = pedidos.filter(p =>
        (!cliente || p.cliente_username === cliente) &&
        (!tipo || p.tipo.toLowerCase() === tipo.toLowerCase()) &&
        (!estado || p.estado === estado) &&
        (!busqueda ||
            String(p.id).includes(busqueda) ||
            p.productos.some(pr => pr.nombre_producto.toLowerCase().includes(busqueda)))
    );

    renderPedidos(resultado);
}

function renderProgramados(lista) {
    const cont = document.getElementById("lista-programados");
    const listaLimitada = lista.slice(0, 4);

    if (listaLimitada.length === 0) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No hay pedidos programados que coincidan con los filtros.</p></div>`;
        return;
    }

    cont.innerHTML = listaLimitada.map(p => {
        const icon = p.tipo === "maritimo"
            ? `<img src="/static/img/icon_contenedor.png" alt="Marítimo" class="order-icon">`
            : `<img src="/static/img/icon_aereo.png" alt="Aéreo" class="order-icon">`;
        const tipoTexto = p.tipo === "maritimo" ? "Contenedor" : "Aéreo";
        const badgeClase = p.estado === "Abierto" ? "estado-abierto" : "estado-cerrado";

        return `
            <div class="pedido-card" ${p.tipo === 'maritimo' ? `onclick="abrirDetalleDespacho(${p.id})"` : ''}>
                <div class="pedido-info">
                    <div class="icono-box">
                        <div class="icon-grande">${icon}</div>
                        <span>${tipoTexto}</span>
                    </div>
                    <div class="pedido-detalle">
                        <h4>Despacho #${p.id}</h4>
                        <p>📍 ${p.destino}</p>
                        <p>📦 Pallets disponibles: ${p.pallets_disponibles}/${p.pallets_totales}</p>
                    </div>
                </div>
                <div class="pedido-meta">
                    <div class="fecha">📅 ${p.fecha_envio}</div>
                    <span class="badge ${badgeClase}">${p.estado}</span>
                </div>
            </div>
        `;
    }).join("") + `
        <div style="text-align:center; margin-top:10px;">
            <a href="/pedidos_progra_admin" class="btn-login" style="text-decoration:none; padding:8px 20px; display:inline-block;">Ver todos los despachos →</a>
        </div>
    `;
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
// eliminar pedidos 
// =========================================================
async function eliminarPedido(id) {
    if (!confirm('¿Eliminar este pedido permanentemente? Esta acción no se puede deshacer.')) return;
    try {
        const resp = await fetch(`/api/pedidos/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error();
        await cargarPedidosDesdeServidor();
    } catch (err) {
        alert('No se pudo eliminar el pedido');
    }
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