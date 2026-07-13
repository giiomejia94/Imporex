document.addEventListener('DOMContentLoaded', () => {

    const btnAbrirPerfil       = document.getElementById('btnAbrirPerfil');
    const modalPerfil          = document.getElementById('modalPerfil');
    const btnCerrarModalPerfil = document.getElementById('btnCerrarModalPerfil');
    const formPerfil           = document.getElementById('formPerfil');
    const btnHabilitarEdicion  = document.getElementById('btnHabilitarEdicionPerfil');
    const btnGuardarPerfil     = document.getElementById('btnGuardarPerfil');
    const perfilUsername       = document.getElementById('perfilUsername');
    const perfilNombre         = document.getElementById('perfilNombre');
    const perfilCorreo         = document.getElementById('perfilCorreo');
    const perfilPassword       = document.getElementById('perfilPassword');
    const perfilFotoInput      = document.getElementById('perfilFotoInput');
    const perfilFotoImg        = document.getElementById('perfilFotoImg');

    if (!btnAbrirPerfil || !modalPerfil) return;

    function mostrarToast(mensaje, esError = false) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = mensaje;
        toast.style.background = esError ? '#d63031' : '#1f3558';
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    function habilitarCampos(habilitar) {
        [perfilNombre, perfilCorreo, perfilPassword].forEach(c => c.disabled = !habilitar);
        btnHabilitarEdicion.style.display = habilitar ? 'none'         : 'inline-block';
        btnGuardarPerfil.style.display    = habilitar ? 'inline-block' : 'none';
    }

    async function cargarPerfil() {
        try {
            const resp = await fetch('/api/perfil');
            if (!resp.ok) throw new Error();
            const datos = await resp.json();
            perfilUsername.value = datos.username || '';
            perfilNombre.value   = datos.nombre   || '';
            perfilCorreo.value   = datos.correo   || '';
            perfilPassword.value = '';
            if (datos.foto_perfil) {
                perfilFotoImg.src = '/' + datos.foto_perfil + '?t=' + Date.now();
            }
        } catch {
            mostrarToast('Error al cargar el perfil', true);
        }
    }

    // Abrir modal
    btnAbrirPerfil.addEventListener('click', (e) => {
        e.preventDefault();
        habilitarCampos(false);
        cargarPerfil();
        modalPerfil.style.display = 'flex';
    });

    // Cerrar modal
    if (btnCerrarModalPerfil) {
        btnCerrarModalPerfil.addEventListener('click', () => {
            modalPerfil.style.display = 'none';
        });
    }

    // Cerrar al hacer click fuera del modal-box
    modalPerfil.addEventListener('click', (e) => {
        if (e.target === modalPerfil) modalPerfil.style.display = 'none';
    });

    // Habilitar edición
    if (btnHabilitarEdicion) {
        btnHabilitarEdicion.addEventListener('click', () => habilitarCampos(true));
    }

    // Vista previa de foto + subida inmediata
    if (perfilFotoInput) {
        perfilFotoInput.addEventListener('change', async () => {
            const archivo = perfilFotoInput.files[0];
            if (!archivo) return;

            // Vista previa local inmediata
            const lector = new FileReader();
            lector.onload = (e) => { perfilFotoImg.src = e.target.result; };
            lector.readAsDataURL(archivo);

            // Subir al servidor
            const formData = new FormData();
            formData.append('foto', archivo);
            try {
                const resp = await fetch('/api/perfil/foto', { method: 'POST', body: formData });
                if (!resp.ok) throw new Error();
                const datos = await resp.json();
                perfilFotoImg.src = '/' + datos.foto_perfil + '?t=' + Date.now();
                const headerAvatar = document.getElementById('headerFotoUsuario');
if (headerAvatar) headerAvatar.src = '/' + datos.foto_perfil + '?t=' + Date.now();
                mostrarToast('Foto actualizada ✔');
            } catch {
                mostrarToast('No se pudo subir la foto', true);
            }
        });
    }

    // Guardar cambios de perfil
    if (formPerfil) {
        formPerfil.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const resp = await fetch('/api/perfil', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nombre:   perfilNombre.value,
                        correo:   perfilCorreo.value,
                        password: perfilPassword.value
                    })
                });
                if (!resp.ok) throw new Error();
                mostrarToast('Perfil actualizado ✔');
                habilitarCampos(false);
            } catch {
                mostrarToast('No se pudo guardar el perfil', true);
            }
        });
    }

    // Dropdown
    const userBadgeInner = document.querySelector('.user-badge-inner');
    const dropdownContent = document.querySelector('.dropdown-content');

    if (userBadgeInner && dropdownContent) {
        userBadgeInner.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdownContent.classList.toggle('abierto');
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.user-badge')) {
            dropdownContent.classList.remove('abierto');
        }
    });
    }
    
    
}); // ← único cierre del DOMContentLoaded