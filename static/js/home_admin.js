document.addEventListener('DOMContentLoaded', () => {

    const gridUsuarios = document.getElementById('gridUsuarios');
    const btnAgregar = document.getElementById('btnAgregarUsuario');
    const btnEditar = document.getElementById('btnEditarUsuario');
    const btnEliminar = document.getElementById('btnEliminarUsuario');

    const modal = document.getElementById('modalUsuario');
    const modalTitulo = document.getElementById('modalUsuarioTitulo');
    const formUsuario = document.getElementById('formUsuario');
    const btnCerrarModal = document.getElementById('btnCerrarModalUsuario');

    const tablaPeticiones = document.getElementById('tablaPeticiones');
    const tablaPedidos = document.getElementById('tablaPedidos');

    const toast = document.getElementById('toast');

    let modoActivo = null; // 'editar' | 'eliminar' | null

    // ---------- utilidades ----------
    function mostrarToast(mensaje, esError = false) {
        if (!toast) return;
        toast.textContent = mensaje;
        toast.style.background = esError ? '#d63031' : '#1f3558';
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    function limpiarSeleccion() {
        if (!gridUsuarios) return;
        gridUsuarios.querySelectorAll('.usuario-card').forEach(card => {
            card.classList.remove('modo-seleccion');
            const check = card.querySelector('.usuario-check');
            if (check) check.checked = false;
        });
    }

    function salirModo() {
        modoActivo = null;
        if (btnEditar) btnEditar.classList.remove('activo');
        if (btnEliminar) btnEliminar.classList.remove('activo');
        limpiarSeleccion();
    }

    function abrirModal(usuario = null) {
        if (!modal || !formUsuario) return;
        formUsuario.reset();
        if (usuario) {
            modalTitulo.textContent = 'Editar usuario';
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
        modal.style.display = 'flex';
    }

    function cerrarModal() {
        if (modal) modal.style.display = 'none';
    }

    // ---------- botones de acciones sobre usuarios ----------
    if (btnAgregar) {
        btnAgregar.addEventListener('click', () => {
            salirModo();
            abrirModal();
        });
    }

    if (btnEditar) {
        btnEditar.addEventListener('click', () => {
            if (modoActivo === 'editar') { salirModo(); return; }
            modoActivo = 'editar';
            btnEliminar.classList.remove('activo');
            btnEditar.classList.add('activo');
            mostrarToast('Selecciona un usuario para editar');
        });
    }

    if (btnEliminar) {
        btnEliminar.addEventListener('click', async () => {
            if (modoActivo !== 'eliminar') {
                modoActivo = 'eliminar';
                btnEditar.classList.remove('activo');
                btnEliminar.classList.add('activo');
                gridUsuarios.querySelectorAll('.usuario-card').forEach(c => c.classList.add('modo-seleccion'));
                mostrarToast('Selecciona los usuarios a eliminar y vuelve a pulsar Eliminar para confirmar');
                return;
            }

            const seleccionados = Array.from(gridUsuarios.querySelectorAll('.usuario-check:checked'))
                .map(chk => chk.dataset.id);

            if (seleccionados.length === 0) {
                mostrarToast('No seleccionaste ningún usuario', true);
                salirModo();
                return;
            }

            if (!confirm(`¿Eliminar ${seleccionados.length} usuario(s)? Esta acción no se puede deshacer.`)) {
                salirModo();
                return;
            }

            try {
                for (const id of seleccionados) {
                    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
                    const card = gridUsuarios.querySelector(`.usuario-card[data-id="${id}"]`);
                    if (card) card.remove();
                }
                mostrarToast('Usuario(s) eliminado(s) correctamente');
            } catch (err) {
                mostrarToast('Error al eliminar usuario(s)', true);
            }
            salirModo();
        });
    }

    // click sobre una tarjeta de usuario
    if (gridUsuarios) {
        gridUsuarios.addEventListener('click', async (e) => {
            const card = e.target.closest('.usuario-card');
            if (!card) return;
            const id = card.dataset.id;

            if (modoActivo === 'eliminar') {
                const check = card.querySelector('.usuario-check');
                if (check && e.target !== check) check.checked = !check.checked;
                return;
            }

            if (modoActivo === 'editar') {
                try {
                    const resp = await fetch(`/api/usuarios/${id}`);
                    if (!resp.ok) throw new Error('No se pudo obtener el usuario');
                    const usuario = await resp.json();
                    abrirModal(usuario);
                    salirModo();
                } catch (err) {
                    mostrarToast('Error al cargar el usuario', true);
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

    // ---------- peticiones pendientes: aprobar / rechazar ----------
    if (tablaPeticiones) {
        tablaPeticiones.addEventListener('click', async (e) => {
            const fila = e.target.closest('tr');
            if (!fila) return;
            const id = fila.dataset.id;
            if (!id) return;

            if (e.target.classList.contains('btn-aprobar')) {
                const select = fila.querySelector('.select-rol');
                const id_rol = select ? select.value : 1;
                try {
                    const resp = await fetch(`/api/usuarios/${id}/aprobar`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id_rol })
                    });
                    if (!resp.ok) throw new Error();
                    mostrarToast('Usuario aprobado');
                    fila.remove();
                    setTimeout(() => location.reload(), 800);
                } catch (err) {
                    mostrarToast('Error al aprobar el usuario', true);
                }
            }

            if (e.target.classList.contains('btn-rechazar')) {
                if (!confirm('¿Rechazar esta solicitud de cuenta?')) return;
                try {
                    const resp = await fetch(`/api/usuarios/${id}/rechazar`, { method: 'POST' });
                    if (!resp.ok) throw new Error();
                    mostrarToast('Solicitud rechazada');
                    fila.remove();
                } catch (err) {
                    mostrarToast('Error al rechazar la solicitud', true);
                }
            }
        });
    }

    // ---------- pedidos: click en fila lleva a verificación ----------
    if (tablaPedidos) {
        tablaPedidos.addEventListener('click', (e) => {
            const fila = e.target.closest('.fila-pedido');
            if (!fila) return;
            const id = fila.dataset.id;
            if (id) window.location.href = `/pedido_admin/${id}`;
        });
    }

    

});
