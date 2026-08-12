document.addEventListener('DOMContentLoaded', () => {

    const btnCrearMaritimo = document.getElementById('btnCrearMaritimo');
    const btnCrearAereo = document.getElementById('btnCrearAereo');

    const modal = document.getElementById('modalPedidoPrograma');
    const modalTitulo = document.getElementById('modalProgramaTitulo');
    const form = document.getElementById('formPedidoPrograma');
    const btnCerrarModal = document.getElementById('btnCerrarModalPrograma');
    const tablaProgramados = document.getElementById('tablaProgramados');

    const toast = document.getElementById('toast');

    function mostrarToast(mensaje, esError = false) {
        if (!toast) return;
        toast.textContent = mensaje;
        toast.style.background = esError ? '#d63031' : '#1f3558';
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    function abrirModal(tipo) {
        if (!modal || !form) return;
        form.reset();
        document.getElementById('programaTipo').value = tipo;
        modalTitulo.textContent = tipo === 'maritimo'
            ? 'Crear pedido programado — Contenedor'
            : 'Crear pedido programado — Aéreo';
        modal.style.display = 'flex';
    }

    function cerrarModal() {
        if (modal) modal.style.display = 'none';
    }

    if (btnCrearMaritimo) btnCrearMaritimo.addEventListener('click', () => abrirModal('maritimo'));
    if (btnCrearAereo) btnCrearAereo.addEventListener('click', () => abrirModal('aereo'));
    if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const datos = {
                tipo: document.getElementById('programaTipo').value,
                fecha_envio: document.getElementById('programaFecha').value,
                destino: document.getElementById('programaDestino').value,
                pallets_totales: document.getElementById('programaPallets').value
            };

            try {
                const resp = await fetch('/api/pedidos_programados', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                if (!resp.ok) throw new Error('Error al crear');
                mostrarToast('Pedido programado creado correctamente');
                cerrarModal();
                setTimeout(() => location.reload(), 800);
            } catch (err) {
                mostrarToast('No se pudo crear el pedido programado', true);
            }
        });
    }
    cargarProgramadosDesdeServidor();
});

let pedidosProgramados = [];

async function cargarProgramadosDesdeServidor() {
    try {
        const response = await fetch("/api/pedidos_programados");
        if (!response.ok) throw new Error("No se pudo cargar el historial");
        pedidosProgramados = await response.json();
        aplicarFiltrosProgramados();
    } catch (error) {
        console.error(error);
        document.getElementById("lista-programados").innerHTML =
            `<div class="empty-state"><div class="empty-icon">⚠️</div><p>No se pudo cargar el historial de pedidos programados.</p></div>`;
    }
}

function renderProgramados(lista) {
    const cont = document.getElementById("lista-programados");
    if (lista.length === 0) {
        cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No hay pedidos programados que coincidan con los filtros.</p></div>`;
        return;
    }

    cont.innerHTML = lista.map(p => {
        const icon = p.tipo === "maritimo"
            ? `<img src="/static/img/icon_contenedor.png" alt="Marítimo" class="order-icon">`
            : `<img src="/static/img/icon_aereo.png" alt="Aéreo" class="order-icon">`;
        const tipoTexto = p.tipo === "maritimo" ? "Contenedor" : "Aéreo";
        const badgeClase = p.estado === "Abierto" ? "estado-abierto" : "estado-cerrado";

        return `
            <div class="pedido-card" ${p.tipo === 'maritimo' ? `onclick="abrirDetalleDespacho(${p.id})"` : ''}>
                <button class="btn-borrar-tarjeta" onclick="event.stopPropagation(); eliminarPedidoProgramado(${p.id})" title="Eliminar">×</button>
                <div class="pedido-info">
                    <div class="icono-box">
                        <div class="icon-grande">${icon}</div>
                        <span>${tipoTexto}</span>
                    </div>
                    <div class="pedido-detalle">
                        <h4>Despacho #${p.numero_despacho}</h4>
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
    }).join("");
}

function aplicarFiltrosProgramados() {
    const tipo = document.getElementById("filtro-tipo-progra").value;
    const estado = document.getElementById("filtro-estado-progra").value;

    const resultado = pedidosProgramados.filter(p =>
        (!tipo || p.tipo === tipo) &&
        (!estado || p.estado === estado)
    );

    renderProgramados(resultado);
}

// =========================================================
// VISTA ADMIN: distribución de pallets de un despacho
// =========================================================
let despachoActualAdmin = null;
let palletSeleccionadoAdmin = null;
let clienteSeleccionadoAdmin = null;

async function abrirDetalleDespacho(idDespacho) {
    despachoActualAdmin = idDespacho;
    try {
        const resp = await fetch(`/api/pedidos_programados/${idDespacho}/pallets`);
        if (!resp.ok) throw new Error();
        const data = await resp.json();
        renderGridPalletsAdmin(data.pallets);
        document.getElementById('modalPalletsAdminOverlay').classList.add('visible');
    } catch (err) {
        alert('No se pudo cargar la distribución de pallets');
    }
}

function renderGridPalletsAdmin(pallets) {
    const cont = document.getElementById('grid-pallets-admin');

    cont.innerHTML = pallets.map(p => {
        const clase = p.ocupado ? 'pallet-slot ocupado' : 'pallet-slot libre';
        const estilo = p.ocupado ? `style="background:${p.color};"` : '';
        return `<div class="${clase}" ${estilo} data-numero="${p.numero_pallet}">${p.ocupado ? p.iniciales : ''}</div>`;
    }).join('');

    const disponibles = pallets.filter(p => !p.ocupado).length;
    document.getElementById('contadorPalletsDisponibles').textContent = disponibles;

    cont.querySelectorAll('.pallet-slot.libre').forEach(slot => {
        slot.addEventListener('click', () => abrirSelectorCliente(parseInt(slot.dataset.numero)));
    });

    cont.querySelectorAll('.pallet-slot.ocupado').forEach(slot => {
        slot.addEventListener('click', () => verDetallePallet(parseInt(slot.dataset.numero)));
    });
}

async function abrirSelectorCliente(numeroPallet) {
    palletSeleccionadoAdmin = numeroPallet;
    document.getElementById('numeroPalletSeleccionado').textContent = numeroPallet;

    const select = document.getElementById('selectClienteReserva');
    select.innerHTML = '<option value="">Seleccionar cliente...</option>';

    try {
        const resp = await fetch('/api/clientes');
        const clientes = await resp.json();
        clientes.forEach(c => {
            select.innerHTML += `<option value="${c.username}">${c.nombre}</option>`;
        });
    } catch (err) {
        alert('No se pudieron cargar los clientes');
    }

    document.getElementById('modalPalletsAdminOverlay').classList.remove('visible');
    document.getElementById('modalClienteReservaOverlay').classList.add('visible');
}

function continuarAReservaCatalogo() {
    const select = document.getElementById('selectClienteReserva');
    if (!select.value) {
        alert('Selecciona un cliente');
        return;
    }
    clienteSeleccionadoAdmin = select.value;
    tipoSeleccionado = 'maritimo'; // variable global ya usada por pedidos.js
    carritoPedido.length = 0; // carrito limpio para este pallet
    document.getElementById('modalClienteReservaOverlay').classList.remove('visible');
    abrirCatalogo(); // función ya existente en pedidos.js

    // Mostrar el botón especial de "Confirmar pallet" y ocultar el normal
    document.getElementById('btn-confirmar-pallet-admin').style.display = 'inline-block';
    document.querySelector('.btn-confirmar-productos:not(#btn-confirmar-pallet-admin)').style.display = 'none';
}

// Cuando el admin ya agregó los productos que quería al carrito,
// se llama esta función (agrégale un botón "Confirmar pallet" al footer del catálogo)
function pedirComentarioDistribucion() {
    if (carritoPedido.length === 0) {
        alert('Agrega al menos un producto a este pallet');
        return;
    }
    cerrarCatalogo();
    document.getElementById('comentarioDistribucion').value = '';
    document.getElementById('modalComentarioOverlay').classList.add('visible');
}

async function confirmarReservaAdmin() {
    const comentario = document.getElementById('comentarioDistribucion').value.trim();
    if (!comentario) {
        alert('El comentario de distribución es obligatorio');
        return;
    }

    const items = carritoPedido.map(p => ({ codigo_producto: p.codigo, cantidad: p.cantidadPacks }));

    try {
        const resp = await fetch(`/api/pedidos_programados/${despachoActualAdmin}/admin_reservar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                numero_pallet: palletSeleccionadoAdmin,
                cliente_username: clienteSeleccionadoAdmin,
                comentario,
                items
            })
        });
        if (!resp.ok) throw new Error();

        document.getElementById('modalComentarioOverlay').classList.remove('visible');
        carritoPedido.length = 0;
        cargarProgramadosDesdeServidor(); // refresca el historial (pallets disponibles)
        abrirDetalleDespacho(despachoActualAdmin); // refresca el grid
    } catch (err) {
        alert('No se pudo confirmar la reserva del pallet');
    }
}

async function eliminarPedidoProgramado(id) {
    if (!confirm('¿Eliminar este despacho y TODAS las participaciones de los clientes? Esta acción no se puede deshacer.')) return;
    try {
        const resp = await fetch(`/api/pedidos_programados/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error();
        await cargarProgramadosDesdeServidor();
    } catch (err) {
        alert('No se pudo eliminar el despacho');
    }
}


async function verDetallePallet(numeroPallet) {
    try {
        const resp = await fetch(`/api/pedidos_programados/${despachoActualAdmin}/pallets/${numeroPallet}/detalle`);
        if (!resp.ok) throw new Error();
        const data = await resp.json();

        document.getElementById('detallePalletNumero').textContent = numeroPallet;
        document.getElementById('detallePalletCliente').textContent = data.nombre_cliente;
        document.getElementById('detallePalletComentario').textContent = data.comentario || '—';
        document.getElementById('tablaDetallePallet').innerHTML = data.productos.map(p => `
            <tr><td>${p.codigo_producto}</td><td>${p.nombre_producto}</td><td>${p.cantidad}</td></tr>
        `).join('');

        document.getElementById('modalPalletsAdminOverlay').classList.remove('visible');
        document.getElementById('modalDetallePalletOverlay').classList.add('visible');
    } catch (err) {
        alert('No se pudo cargar el detalle del pallet');
    }
}