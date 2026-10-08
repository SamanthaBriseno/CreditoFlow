// ============================================
// SCRIPT PARA MODO PRUEBA (1 sola imagen)
// ============================================

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

// ============ VALIDACIÓN DE ARCHIVO ============

document.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', function(e) {
        const file = this.files[0];
        const label = this.closest('.upload-box');
        const errorDiv = label.querySelector('.file-error');
        const fileNameDisplay = label.querySelector('.file-name');

        // Resetear errores
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
        label.classList.remove('has-error');

        if (!file) {
            fileNameDisplay.textContent = 'Seleccionar imagen';
            label.classList.remove('has-file');
            actualizarContador();
            validarFormulario();
            return;
        }

        // Validar tipo
        if (!ALLOWED_TYPES.includes(file.type)) {
            errorDiv.textContent = '❌ Solo se permiten imágenes (JPG, PNG)';
            errorDiv.style.display = 'block';
            label.classList.add('has-error');
            this.value = '';
            fileNameDisplay.textContent = 'Seleccionar imagen';
            label.classList.remove('has-file');
            actualizarContador();
            validarFormulario();
            return;
        }

        // Validar tamaño
        if (file.size > MAX_FILE_SIZE) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            errorDiv.textContent = `❌ El archivo pesa ${sizeMB}MB. Máximo 2MB`;
            errorDiv.style.display = 'block';
            label.classList.add('has-error');
            this.value = '';
            fileNameDisplay.textContent = 'Seleccionar imagen';
            label.classList.remove('has-file');
            actualizarContador();
            validarFormulario();
            return;
        }

        // ✅ Validación exitosa
        const sizeKB = (file.size / 1024).toFixed(0);
        fileNameDisplay.textContent = `✅ ${file.name} (${sizeKB}KB)`;
        label.classList.add('has-file');
        label.classList.remove('has-error');
        actualizarContador();
        validarFormulario();
    });
});

// ============ VALIDACIÓN DE CAMPOS DE TEXTO ============

document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
    input.addEventListener('input', function() {
        validarFormulario();
    });
});

// ============ CONTADOR ============

function actualizarContador() {
    const input = document.querySelector('input[type="file"]');
    const count = input.files[0] ? 1 : 0;
    document.getElementById('numDocs').textContent = count;
}

// ============ VALIDAR FORMULARIO ============

function validarFormulario() {
    const btn = document.getElementById('btnSubmit');
    const nombre = document.getElementById('nombre').value.trim();
    const monto = document.getElementById('monto').value.trim();
    const file = document.querySelector('input[type="file"]').files[0];

    if (nombre && monto && file) {
        btn.disabled = false;
        btn.classList.add('active');
    } else {
        btn.disabled = true;
        btn.classList.remove('active');
    }
}

// ============ ENVIAR FORMULARIO ============

document.getElementById('solicitudForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const btn = document.getElementById('btnSubmit');
    const mensaje = document.getElementById('mensaje');

    if (btn.disabled) {
        mostrarMensaje('Por favor completa todos los campos', 'error');
        return;
    }

    btn.disabled = true;
    btn.classList.add('loading');
    mensaje.style.display = 'none';

    const formData = new FormData();
    formData.append('nombre', document.getElementById('nombre').value.trim());
    formData.append('monto', document.getElementById('monto').value.trim());
    formData.append('documento', document.querySelector('input[type="file"]').files[0]);

    try {
        // ⚠️ IMPORTANTE: Usar /api/upload-test (endpoint de pruebas)
        const response = await fetch('/api/upload-test', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje(`
                ✅ <strong>¡Solicitud de prueba enviada!</strong><br>
                Folio: <strong>${data.folio}</strong><br>
                ${data.mensaje}
                <br><br>
                <a href="/seguimiento.html?folio=${data.folio}" style="color: #7cb87c; font-weight: 600;">
                    Ver seguimiento →
                </a>
            `, 'success');

            // Reset
            this.reset();
            document.querySelectorAll('.upload-box').forEach(box => {
                box.classList.remove('has-file');
                box.classList.remove('has-error');
                box.querySelector('.file-name').textContent = 'Seleccionar imagen';
                const errorDiv = box.querySelector('.file-error');
                if (errorDiv) {
                    errorDiv.style.display = 'none';
                    errorDiv.textContent = '';
                }
            });
            document.getElementById('numDocs').textContent = '0';
            validarFormulario();

        } else {
            throw new Error(data.error || 'Error al enviar');
        }

    } catch (error) {
        mostrarMensaje(`❌ Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        validarFormulario();
    }
});

// ============ MOSTRAR MENSAJE ============

function mostrarMensaje(texto, tipo) {
    const mensaje = document.getElementById('mensaje');
    mensaje.className = `mensaje ${tipo}`;
    mensaje.innerHTML = texto;
    mensaje.style.display = 'block';
}

// ============ INICIALIZACIÓN ============

document.addEventListener('DOMContentLoaded', function() {
    validarFormulario();
});