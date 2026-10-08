// ============ CONFIGURACIÓN ============
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB en bytes
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

// ============ VALIDACIÓN DE ARCHIVOS ============
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
            fileNameDisplay.textContent = 'Seleccionar archivo';
            label.classList.remove('has-file');
            actualizarContador();
            validarFormulario();
            return;
        }

        // VALIDACIÓN 1: Tipo de archivo
        if (!ALLOWED_TYPES.includes(file.type)) {
            errorDiv.textContent = '❌ Solo se permiten imágenes (JPG, PNG)';
            errorDiv.style.display = 'block';
            label.classList.add('has-error');
            this.value = ''; // Limpiar input
            fileNameDisplay.textContent = 'Seleccionar archivo';
            label.classList.remove('has-file');
            actualizarContador();
            validarFormulario();
            return;
        }

        // VALIDACIÓN 2: Tamaño del archivo
        if (file.size > MAX_FILE_SIZE) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            errorDiv.textContent = `❌ El archivo es demasiado grande (${sizeMB}MB). Máximo 2MB`;
            errorDiv.style.display = 'block';
            label.classList.add('has-error');
            this.value = ''; // Limpiar input
            fileNameDisplay.textContent = 'Seleccionar archivo';
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

// ============ CONTADOR DE DOCUMENTOS ============
function actualizarContador() {
    const inputs = document.querySelectorAll('input[type="file"]');
    let count = 0;
    inputs.forEach(input => {
        if (input.files[0]) count++;
    });
    document.getElementById('numDocs').textContent = count;
}

// ============ VALIDAR FORMULARIO COMPLETO ============
function validarFormulario() {
    const btn = document.getElementById('btnSubmit');

    // Verificar que todos los documentos estén subidos
    const inputsFile = document.querySelectorAll('input[type="file"]');
    let todosDocumentos = true;
    let hayErrores = false;

    inputsFile.forEach(input => {
        const label = input.closest('.upload-box');
        const errorDiv = label.querySelector('.file-error');

        if (!input.files[0]) {
            todosDocumentos = false;
        }

        // Si hay error visible en el archivo
        if (errorDiv.style.display === 'block') {
            hayErrores = true;
        }
    });

    // Verificar campos de texto
    const nombre = document.getElementById('nombre').value.trim();
    const monto = document.getElementById('monto').value.trim();
    const camposCompletos = nombre !== '' && monto !== '';

    // Habilitar o deshabilitar botón
    if (todosDocumentos && camposCompletos && !hayErrores) {
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

    // Validación final antes de enviar
    if (btn.disabled) {
        mostrarMensaje('Por favor completa todos los campos y documentos', 'error');
        return;
    }

    const mensaje = document.getElementById('mensaje');

    // Deshabilitar botón
    btn.disabled = true;
    btn.classList.add('loading');
    mensaje.style.display = 'none';

    // Crear FormData
    const formData = new FormData();
    formData.append('nombre', document.getElementById('nombre').value.trim());
    formData.append('monto', document.getElementById('monto').value.trim());

    // Agregar todos los documentos
    const inputsFile = document.querySelectorAll('input[type="file"]');
    let todosSubidos = true;

    for (const input of inputsFile) {
        if (input.files[0]) {
            // Validación extra antes de enviar
            const file = input.files[0];

            if (!ALLOWED_TYPES.includes(file.type)) {
                mostrarMensaje(`❌ El archivo "${file.name}" no es una imagen válida. Solo JPG/PNG.`, 'error');
                btn.disabled = false;
                btn.classList.remove('loading');
                return;
            }

            if (file.size > MAX_FILE_SIZE) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                mostrarMensaje(`❌ El archivo "${file.name}" pesa ${sizeMB}MB. El máximo es 2MB.`, 'error');
                btn.disabled = false;
                btn.classList.remove('loading');
                return;
            }

            formData.append(input.id, file);
        } else {
            todosSubidos = false;
        }
    }

    if (!todosSubidos) {
        mostrarMensaje('❌ Faltan documentos por subir', 'error');
        btn.disabled = false;
        btn.classList.remove('loading');
        return;
    }

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            mostrarMensaje(`
                ✅ <strong>¡Solicitud enviada!</strong><br>
                Folio: <strong>${data.folio}</strong><br>
                ${data.mensaje}
                <br><br>
                <a href="/seguimiento.html?folio=${data.folio}" style="color: #7cb87c; font-weight: 600;">
                    Ver seguimiento →
                </a>
            `, 'success');

            // Resetear formulario
            this.reset();
            document.querySelectorAll('.upload-box').forEach(box => {
                box.classList.remove('has-file');
                box.classList.remove('has-error');
                box.querySelector('.file-name').textContent = 'Seleccionar archivo';
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