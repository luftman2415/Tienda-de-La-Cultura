// --- INICIALIZACIÓN INTELIGENTE Y ROBUSTA ---
document.addEventListener('DOMContentLoaded', () => {
    updateCopyrightYear();
    if (document.getElementById('tabla-inventario')) {
        initIndexPage();
    } else if (document.getElementById('tabla-kardex')) {
        initKardexPage();
    }
});

// --- BASE DE DATOS (localStorage) ---
function getDatabase() {
    const data = localStorage.getItem('tiendaData');
    if (!data) {
        return { productos: [], compras: [], ventas: [], nextId: { producto: 1, compra: 1, venta: 1 } };
    }
    return JSON.parse(data);
}
function saveDatabase(db) {
    localStorage.setItem('tiendaData', JSON.stringify(db));
}

// --- LÓGICA ESPECÍFICA DE CADA PÁGINA ---
function initIndexPage() {
    document.getElementById('form-nuevo-producto').addEventListener('submit', addProducto);
    document.getElementById('form-nueva-compra').addEventListener('submit', addCompra);
    document.getElementById('form-nueva-venta').addEventListener('submit', addVenta);
    document.getElementById('btn-exportar').addEventListener('click', exportarDatos);
    document.getElementById('import-file').addEventListener('change', importarDatos);
    const calcForm = document.getElementById('form-calculadora');
    calcForm.addEventListener('input', updatePrecioSugerido);
    renderizarTodo();
}
function initKardexPage() {
    renderKardex();
}

function renderizarTodo() {
    renderTablaInventario();
    renderSelectsDeProductos();
}

function renderTablaInventario() {
    const db = getDatabase();
    const tbody = document.getElementById('tabla-inventario');
    tbody.innerHTML = ''; 
    if (db.productos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No hay productos. Añade uno para empezar.</td></tr>';
        return;
    }
    db.productos.forEach(p => {
        const comprasProducto = db.compras.filter(c => c.producto_id === p.id);
        const ventasProducto = db.ventas.filter(v => v.producto_id === p.id);
        const stock = comprasProducto.reduce((s, c) => s + c.cantidad, 0) - ventasProducto.reduce((s, v) => s + v.cantidad, 0);
        const tr = document.createElement('tr');
        let deleteBtnHtml = '';
        if (stock === 0 && comprasProducto.length === 0 && ventasProducto.length === 0) {
            deleteBtnHtml = `<button class="btn-delete" onclick="deleteProducto(${p.id})">Eliminar</button>`;
        }
        
        let precioVentaHtml = '<span style="color: #e74c3c;">No definido</span>';
        if (typeof p.precio_venta === 'number') {
            precioVentaHtml = `$${p.precio_venta.toFixed(2)}`;
        }

        tr.innerHTML = `<td>${p.nombre}</td><td>${stock}</td><td>${precioVentaHtml}</td><td><a href="kardex.html?id=${p.id}">Ver Kardex</a></td><td>${deleteBtnHtml}</td>`;
        tbody.appendChild(tr);
    });
}

function renderSelectsDeProductos() {
    const db = getDatabase();
    const selects = document.querySelectorAll('#compra_producto, #venta_producto');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="" disabled selected>-- Selecciona un producto --</option>';
        db.productos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.nombre;
            select.appendChild(option);
        });
        select.value = currentValue;
    });
}

// --- LÓGICA DE OPERACIONES ---
function addProducto(event) {
    event.preventDefault(); 
    const form = event.target;
    const nombre = form.nombre.value.trim();
    const precio_venta = parseFloat(form.precio_venta.value);
    if (!nombre || isNaN(precio_venta)) {
        showModal('Debes indicar un nombre y un precio de venta.', 'error');
        return;
    }
    const db = getDatabase();
    if (db.productos.some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
        showModal('Este producto ya existe.', 'error');
        return;
    }
    db.productos.push({ id: db.nextId.producto++, nombre: nombre, precio_venta: precio_venta });
    saveDatabase(db);
    form.reset();
    renderizarTodo();
    showModal(`Producto "${nombre}" creado con éxito.`, 'success');
}
function addCompra(event) {
    event.preventDefault();
    const form = event.target;
    const producto_id = parseInt(form.producto_id.value);
    const cantidad = parseInt(form.cantidad.value);
    const costo_unitario = parseFloat(form.costo_unitario.value);
    const fecha_vencimiento = form.fecha_vencimiento.value || null; 

    if (!producto_id || !cantidad || isNaN(costo_unitario)) {
        showModal('Por favor, completa todos los campos de compra correctamente.', 'error');
        return;
    }
    const db = getDatabase();
    db.compras.push({ id: db.nextId.compra++, producto_id, cantidad, costo_unitario, fecha_vencimiento, fecha_compra: new Date().toISOString() });
    saveDatabase(db);
    form.reset();
    renderizarTodo();
    showModal('Compra registrada con éxito.', 'success');
}
function addVenta(event) {
    event.preventDefault();
    const form = event.target;
    const producto_id = parseInt(form.producto_id.value);
    const cantidad_a_vender = parseInt(form.cantidad.value);
    if (!producto_id || !cantidad_a_vender) { return; }

    const db = getDatabase();
    const producto = db.productos.find(p => p.id === producto_id);

    if (typeof producto.precio_venta !== 'number') {
        showModal('Error: Este producto no tiene un precio de venta definido. Por favor, elimínalo y vuelve a crearlo asignándole un precio.', 'error');
        return;
    }

    const totalComprado = db.compras.filter(c => c.producto_id === producto_id).reduce((sum, c) => sum + c.cantidad, 0);
    const totalVendido = db.ventas.filter(v => v.producto_id === producto_id).reduce((sum, v) => sum + v.cantidad, 0);
    if ((totalComprado - totalVendido) < cantidad_a_vender) {
        showModal('No hay suficiente stock para realizar esta venta.', 'error');
        return;
    }
    
    const lotesDeCompra = db.compras.filter(c => c.producto_id === producto_id)
        .sort((a, b) => {
            if (a.fecha_vencimiento && b.fecha_vencimiento) {
                return new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento);
            } else if (a.fecha_vencimiento) { return -1; } 
              else if (b.fecha_vencimiento) { return 1; } 
              else { return new Date(a.fecha_compra) - new Date(b.fecha_compra); }
        });
    
    const ventasPrevias = db.ventas.filter(v => v.producto_id === producto_id);
    const stockPorLote = {};
    lotesDeCompra.forEach(lote => { stockPorLote[lote.id] = lote.cantidad; });
    ventasPrevias.forEach(venta => { venta.detalle_costo.forEach(detalle => { stockPorLote[detalle.compra_id] -= detalle.cantidad_tomada; }); });
    
    let cantidad_restante_por_asignar = cantidad_a_vender;
    const detalle_costo_venta = [];
    for (const lote of lotesDeCompra) {
        if (cantidad_restante_por_asignar <= 0) break;
        const stockDisponibleEnLote = stockPorLote[lote.id] || 0;
        if (stockDisponibleEnLote <= 0) continue;
        const cantidad_a_tomar = Math.min(cantidad_restante_por_asignar, stockDisponibleEnLote);
        detalle_costo_venta.push({ compra_id: lote.id, cantidad_tomada: cantidad_a_tomar, costo_aplicado: lote.costo_unitario });
        cantidad_restante_por_asignar -= cantidad_a_tomar;
    }
    
    db.ventas.push({ id: db.nextId.venta++, producto_id, cantidad: cantidad_a_vender, fecha: new Date().toISOString(), detalle_costo: detalle_costo_venta });
    saveDatabase(db);
    form.reset();
    renderizarTodo();

    const costoTotalDeLaVenta = detalle_costo_venta.reduce((sum, d) => sum + (d.cantidad_tomada * d.costo_aplicado), 0);
    const ingresoTotalDeLaVenta = cantidad_a_vender * producto.precio_venta;
    const ganancia = ingresoTotalDeLaVenta - costoTotalDeLaVenta;
    const margen = ingresoTotalDeLaVenta > 0 ? (ganancia / ingresoTotalDeLaVenta) * 100 : 0;
    
    showModal(`¡Venta Exitosa!\nIngreso: $${ingresoTotalDeLaVenta.toFixed(2)}\nCosto: $${costoTotalDeLaVenta.toFixed(2)}\nGanancia: $${ganancia.toFixed(2)}\nMargen: ${margen.toFixed(1)}%`, 'success');
}

// --- FUNCIONES DE ELIMINAR ---
function deleteVenta(venta_id) {
    showModal('¿Estás seguro de que quieres eliminar esta venta? Esta acción no se puede deshacer.','confirm',() => {
            let db = getDatabase();
            db.ventas = db.ventas.filter(v => v.id !== venta_id);
            saveDatabase(db);
            renderKardex();
        }
    );
}
function deleteProducto(producto_id) {
    showModal('¿Estás seguro de que quieres eliminar este producto? Se borrará todo su historial.','confirm',() => {
            let db = getDatabase();
            db.productos = db.productos.filter(p => p.id !== producto_id);
            db.compras = db.compras.filter(c => c.producto_id !== producto_id);
            db.ventas = db.ventas.filter(v => v.producto_id !== producto_id);
            saveDatabase(db);
            renderizarTodo();
            showModal('Producto y todo su historial han sido eliminados.', 'success');
        }
    );
}

// --- HERRAMIENTAS ADICIONALES ---
function updatePrecioSugerido() {
    const costo = parseFloat(document.getElementById('calc_costo').value);
    const margen = parseFloat(document.getElementById('calc_margen').value);
    const output = document.getElementById('precio-sugerido');

    if (isNaN(costo) || isNaN(margen) || margen >= 100 || costo <=0 || margen <0) {
        output.textContent = '$0.00';
        return;
    }
    const precioSugerido = costo / (1 - (margen / 100));
    output.textContent = `$${precioSugerido.toFixed(2)}`;
}

// --- IMPORTAR/EXPORTAR, COPYRIGHT y MODAL ---
function updateCopyrightYear() {
    const yearSpan = document.getElementById('copyright-year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
}
function exportarDatos() {
    const db = getDatabase();
    if (db.productos.length === 0) { showModal('No hay datos para exportar.', 'error'); return; }
    const dataStr = JSON.stringify(db, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'backup_tienda.json';
    link.click();
    URL.revokeObjectURL(url);
    showModal('Datos exportados con éxito.', 'success');
}
function importarDatos(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data && data.productos && data.compras && data.ventas && data.nextId) {
                showModal('¿Reemplazar TODOS los datos actuales con los del archivo?','confirm',() => {
                        saveDatabase(data);
                        renderizarTodo();
                        showModal('Datos importados con éxito.', 'success');
                    }
                );
            } else { showModal('El archivo no parece ser un backup válido.', 'error'); }
        } catch (error) { showModal('Error al leer el archivo.', 'error'); }
    };
    reader.readAsText(file);
    event.target.value = null;
}
function showModal(message, type = 'info', onConfirm = null) {
    const modal = document.getElementById('custom-modal');
    if (!modal) return;
    const messageP = document.getElementById('modal-message');
    const buttonsDiv = document.getElementById('modal-buttons');
    messageP.style.whiteSpace = 'pre-wrap'; 
    messageP.textContent = message;
    buttonsDiv.innerHTML = ''; 
    if (type === 'confirm') {
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Aceptar';
        confirmBtn.onclick = () => { if (onConfirm) onConfirm(); closeModal(); };
        buttonsDiv.appendChild(confirmBtn);
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.className = 'btn-cancel';
        cancelBtn.onclick = closeModal;
        buttonsDiv.appendChild(cancelBtn);
    } else {
        const okBtn = document.createElement('button');
        okBtn.textContent = 'Entendido';
        okBtn.onclick = closeModal;
        buttonsDiv.appendChild(okBtn);
        if (type === 'success') okBtn.style.backgroundColor = 'var(--success-color)';
        if (type === 'error') okBtn.style.backgroundColor = 'var(--danger-color)';
    }
    modal.classList.add('visible');
}
function closeModal() {
    const modal = document.getElementById('custom-modal');
    if (modal) modal.classList.remove('visible');
}
function renderKardex() {
    const params = new URLSearchParams(window.location.search);
    const producto_id = parseInt(params.get('id'));
    if (!producto_id) { return; }
    const db = getDatabase();
    const producto = db.productos.find(p => p.id === producto_id);
    if (!producto) { return; }
    document.getElementById('kardex-titulo').textContent = `Kardex: ${producto.nombre}`;
    const comprasProducto = db.compras.filter(c => c.producto_id === producto_id).map(c => ({...c, tipo: 'compra' }));
    const ventasProducto = db.ventas.filter(v => v.producto_id === producto_id).map(v => ({...v, tipo: 'venta' }));
    const movimientos = [...comprasProducto, ...ventasProducto].sort((a, b) => new Date(a.fecha || a.fecha_compra) - new Date(b.fecha || b.fecha_compra));
    const tbody = document.getElementById('tabla-kardex');
    tbody.innerHTML = '';
    let saldo_cantidad = 0;
    let saldo_costo_total = 0;
    movimientos.forEach((mov, index) => {
        const tr = document.createElement('tr');
        const fecha = new Date(mov.fecha || mov.fecha_compra).toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const detalle = mov.tipo === 'compra' ? 'Compra' : 'Venta';
        
        // ✅✅✅ LA CORRECCIÓN PRINCIPAL ESTÁ AQUÍ ✅✅✅
        // Se construyen los bloques de celdas por separado para evitar desalineación.
        let entradasHtml = `<td></td><td></td><td></td><td></td>`; // 4 celdas vacías
        let salidasHtml = `<td></td><td></td><td></td>`; // 3 celdas vacías
        let accionHtml = '';

        if (mov.tipo === 'compra') {
            const costoTotalCompra = mov.cantidad * mov.costo_unitario;
            const fecha_venc = mov.fecha_vencimiento ? new Date(mov.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-CO') : 'N/A';
            entradasHtml = `
                <td>${mov.cantidad}</td>
                <td>$${mov.costo_unitario.toFixed(2)}</td>
                <td>$${costoTotalCompra.toFixed(2)}</td>
                <td>${fecha_venc}</td>
            `;
            saldo_cantidad += mov.cantidad;
            saldo_costo_total += costoTotalCompra;
        } else { // Venta
            const costoTotalVenta = mov.detalle_costo.reduce((sum, d) => sum + (d.cantidad_tomada * d.costo_aplicado), 0);
            salidasHtml = `
                <td>${mov.cantidad}</td>
                <td>FEFO/FIFO</td>
                <td>$${costoTotalVenta.toFixed(2)}</td>
            `;
            saldo_cantidad -= mov.cantidad;
            saldo_costo_total -= costoTotalVenta;
            if (index === movimientos.length - 1) {
                accionHtml = `<button class="btn-delete" onclick="deleteVenta(${mov.id})">Eliminar</button>`;
            }
        }
        const saldo_costo_promedio = saldo_cantidad > 0 ? (saldo_costo_total / saldo_cantidad).toFixed(2) : '0.00';
        
        tr.innerHTML = `
            <td>${fecha}</td>
            <td>${detalle}</td>
            ${entradasHtml}
            ${salidasHtml}
            <td>${saldo_cantidad}</td>
            <td>$${saldo_costo_total.toFixed(2)}</td>
            <td>$${saldo_costo_promedio}</td>
            <td>${accionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}