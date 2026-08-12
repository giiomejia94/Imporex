document.addEventListener('DOMContentLoaded', () => {

    const gridUsuarios = document.getElementById('gridUsuarios');
    const gridPeticiones = document.getElementById('gridPeticiones');
    const btnAgregar = document.getElementById('btnAgregarUsuario');

    const modal = document.getElementById('modalUsuario');
    const modalTitulo = document.getElementById('modalUsuarioTitulo');
    const formUsuario = document.getElementById('formUsuario');
    const btnCerrarModal = document.getElementById('btnCerrarModalUsuario');
    const btnGuardarUsuario = document.querySelector('#formUsuario button[type="submit"]');

    const toast = document.getElementById('toast');

    // ---------- utilidades ----------
    function mostrarToast(mensaje, esError = false) {
        if (!toast) return;
        toast.textContent = mensaje;
        toast.style.background = esError ? '#d63031' : '#1f3558';
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    function abrirModal(usuario = null, soloLectura = false) {
        if (!modal || !formUsuario) return;
        formUsuario.reset();

        const campos = ['usuarioNombre', 'usuarioCorreo', 'usuarioPassword', 'usuarioRol'];

        if (usuario) {
            modalTitulo.textContent = soloLectura ? 'Detalle del usuario' : 'Editar usuario';
            document.getElementById('usuarioId').value = usuario.id_usuario || '';
            document.getElementById('usuarioUsername').value = usuario.id_usuario || '';
            document.getElementById('usuarioUsername').readOnly = true;
            document.getElementById('usuarioNombre').value = usuario.nombre || '';
            document.getElementById('usuarioCorreo').value = usuario.correo || '';
            document.getElementById('usuarioRol').value = usuario.id_rol || 1;
            document.getElementById('usuarioPassword').required = false;
        } else {
            modalTitulo.textContent = 'Agregar usuario';
            document.getElementById('usuarioId').value = '';
            document.getElementById('usuarioUsername').readOnly = false;
            document.getElementById('usuarioPassword').required = true;
        }

        // modo "Ver": todo deshabilitado, sin botón de guardar
        campos.forEach(id => document.getElementById(id).disabled = soloLectura);
        document.getElementById('usuarioUsername').disabled = soloLectura;
        if (btnGuardarUsuario) btnGuardarUsuario.style.display = soloLectura ? 'none' : 'inline-block';

        modal.style.display = 'flex';
    }

    function cerrarModal() {
        if (modal) modal.style.display = 'none';
    }

    // ---------- agregar usuario ----------
    if (btnAgregar) {
        btnAgregar.addEventListener('click', () => abrirModal());
    }

    // ---------- acciones sobre cada tarjeta de usuario (ver / editar / eliminar) ----------
    if (gridUsuarios) {
        gridUsuarios.addEventListener('click', async (e) => {
            const boton = e.target.closest('[data-accion]');
            if (!boton) return;

            const card = e.target.closest('.empleado-card');
            const id = card.dataset.id;
            const accion = boton.dataset.accion;

            if (accion === 'ver' || accion === 'editar') {
                try {
                    const resp = await fetch(`/api/usuarios/${id}`);
                    if (!resp.ok) throw new Error('No se pudo obtener el usuario');
                    const usuario = await resp.json();
                    abrirModal(usuario, accion === 'ver');
                } catch (err) {
                    mostrarToast('Error al cargar el usuario', true);
                }
            }

            if (accion === 'eliminar') {
                if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
                try {
                    const resp = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
                    if (!resp.ok) throw new Error();
                    card.remove();
                    mostrarToast('Usuario eliminado correctamente');
                } catch (err) {
                    mostrarToast('No se pudo eliminar el usuario', true);
                }
            }
        });
    }

    if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);

    // ---------- guardar usuario (crear o editar) ----------
    if (formUsuario) {
        formUsuario.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('usuarioId').value;
            const datos = {
                username: document.getElementById('usuarioUsername').value,
                nombre: document.getElementById('usuarioNombre').value,
                correo: document.getElementById('usuarioCorreo').value,
                password: document.getElementById('usuarioPassword').value,
                id_rol: document.getElementById('usuarioRol').value
            };

            const url = id ? `/api/usuarios/${id}` : '/api/usuarios';
            const method = id ? 'PUT' : 'POST';

            try {
                const resp = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                if (!resp.ok) throw new Error('Error al guardar');
                mostrarToast('Usuario guardado correctamente');
                cerrarModal();
                setTimeout(() => location.reload(), 800);
            } catch (err) {
                mostrarToast('No se pudo guardar el usuario', true);
            }
        });
    }

    // ---------- peticiones pendientes: aprobar / rechazar (por tarjeta) ----------
    if (gridPeticiones) {
        gridPeticiones.addEventListener('click', async (e) => {
            const boton = e.target.closest('[data-accion]');
            if (!boton) return;

            const card = e.target.closest('.empleado-card');
            const id = card.dataset.id;
            const accion = boton.dataset.accion;

            if (accion === 'aprobar') {
                const select = card.querySelector('.select-rol-peticion');
                const id_rol = select ? select.value : 1;
                try {
                    const resp = await fetch(`/api/usuarios/${id}/aprobar`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id_rol })
                    });
                    if (!resp.ok) throw new Error();
                    mostrarToast('Usuario aprobado');
                    card.remove();
                    setTimeout(() => location.reload(), 800);
                } catch (err) {
                    mostrarToast('Error al aprobar el usuario', true);
                }
            }

            if (accion === 'rechazar') {
                if (!confirm('¿Rechazar esta solicitud de cuenta?')) return;
                try {
                    const resp = await fetch(`/api/usuarios/${id}/rechazar`, { method: 'POST' });
                    if (!resp.ok) throw new Error();
                    mostrarToast('Solicitud rechazada');
                    card.remove();
                } catch (err) {
                    mostrarToast('Error al rechazar la solicitud', true);
                }
            }
        });
    }

});

// =========================================================
// HOME ADMIN: ver participantes y verificar productos
// (sobrescribe abrirDetalleDespacho solo en esta página)
// =========================================================

async function abrirDetalleDespacho(idDespacho) {
    try {
        const resp = await fetch(`/api/pedidos_programados/${idDespacho}/participantes`);
        if (!resp.ok) throw new Error();
        const participantes = await resp.json();

        const cont = document.getElementById('lista-participantes');
        if (participantes.length === 0) {
            cont.innerHTML = '<p class="empty-msg">Todavía nadie ha reservado pallets en este despacho.</p>';
        } else {
            cont.innerHTML = participantes.map(p => `
                <div class="participante-item" onclick="abrirVerificacionCliente(${p.id_pedido}, '${p.nombre_cliente}')">
                    <strong>${p.nombre_cliente}</strong>
                    <span class="participante-pallets">Pallets: ${p.pallets.join(', ')}</span>
                </div>
            `).join('');
        }

        document.getElementById('modalParticipantesOverlay').classList.add('visible');
    } catch (err) {
        alert('No se pudo cargar la lista de participantes');
    }
}

async function abrirVerificacionCliente(idPedido, nombreCliente) {
    try {
        const resp = await fetch(`/api/pedidos/${idPedido}/verificacion`);
        if (!resp.ok) throw new Error();
        const data = await resp.json();

        document.getElementById('verificacionTitulo').textContent = `Verificar pedido de ${nombreCliente}`;

        const grupos = {};
        data.productos.forEach(p => {
            const key = p.numero_pallet || 'Sin pallet';
            if (!grupos[key]) grupos[key] = [];
            grupos[key].push(p);
        });

        let html = '';
        Object.keys(grupos).sort().forEach(numeroPallet => {
            html += `<div class="pallet-grupo-titulo">Pallet #${numeroPallet}</div>`;
            grupos[numeroPallet].forEach(p => {
                const clase = p.aprobado === 1 ? 'aprobado' : (p.aprobado === 0 ? 'rechazado' : '');
                html += `
                    <div class="producto-verificar-item ${clase}" id="producto-linea-${p.id}">
                        <div class="producto-verificar-info">
                            <strong>${p.nombre_producto}</strong> (${p.codigo_producto}) — ${p.cantidad} und.
                        </div>
                        <div class="producto-verificar-acciones">
                            <button class="btn-aprobar-producto" onclick="verificarProducto(${p.id}, true, ${p.cantidad})">Aprobar</button>
                            <button class="btn-rechazar-producto" onclick="verificarProducto(${p.id}, false, ${p.cantidad})">Rechazar</button>
                        </div>
                    </div>
                `;
            });
        });

        document.getElementById('contenido-verificacion').innerHTML = html;
        document.getElementById('modalParticipantesOverlay').classList.remove('visible');
        document.getElementById('modalVerificacionOverlay').classList.add('visible');
    } catch (err) {
        alert('No se pudo cargar la verificación del pedido');
    }
}

async function verificarProducto(idLineaProducto, aprobado, cantidad) {
    try {
        const resp = await fetch(`/api/pedido_productos/${idLineaProducto}/verificar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                aprobado: aprobado,
                cantidad_verificada: cantidad,
                observacion: ''
            })
        });
        if (!resp.ok) throw new Error();

        const fila = document.getElementById(`producto-linea-${idLineaProducto}`);
        fila.classList.remove('aprobado', 'rechazado');
        fila.classList.add(aprobado ? 'aprobado' : 'rechazado');
    } catch (err) {
        alert('No se pudo guardar la verificación');
    }
}
function verDetalle(id) {
    window.location.href = `/pedido_admin/${id}`;
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
    }).join("") + `
        <div style="text-align:center; margin-top:10px;">
            <a href="/pedidos_progra_admin" class="btn-login" style="text-decoration:none; padding:8px 20px; display:inline-block;">Ver todos los despachos →</a>
        </div>
    `;
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

// =========================================================
// gestion de usuarios
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const inputBusqueda = document.getElementById('busquedaUsuarios');
    const gridUsuarios = document.getElementById('gridUsuarios');
    if (!inputBusqueda || !gridUsuarios) return;

    const tarjetas = Array.from(gridUsuarios.querySelectorAll('.empleado-card'));
    const MAX_SIN_BUSQUEDA = 4;

    function aplicarBusquedaUsuarios() {
        const texto = inputBusqueda.value.trim().toLowerCase();

        if (!texto) {
            // sin búsqueda: solo se ven las primeras 4
            tarjetas.forEach((card, i) => {
                card.style.display = i < MAX_SIN_BUSQUEDA ? '' : 'none';
            });
            return;
        }

        // con búsqueda: se muestran TODAS las que coincidan, sin límite
        tarjetas.forEach(card => {
            const nombre = card.querySelector('.empleado-info-box .empleado-fila:nth-child(1) strong').textContent.toLowerCase();
            const username = (card.dataset.id || '').toLowerCase();
            const coincide = nombre.includes(texto) || username.includes(texto);
            card.style.display = coincide ? '' : 'none';
        });
    }

    inputBusqueda.addEventListener('input', aplicarBusquedaUsuarios);
    aplicarBusquedaUsuarios(); // aplica el límite de 4 apenas carga la página
});


