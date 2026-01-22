const fs = require("fs");
const path = require("path");

const isTruthy = (value) => {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const useLocalData =
  isTruthy(process.env.local_data) ||
  isTruthy(process.env.LOCAL_DATA) ||
  isTruthy(process.env.LOCAL_DEMO);

const seedPath = path.join(__dirname, "data", "demo-data.json");
let seedData = {
  companies: [],
  warehouses: [],
  products: [],
  inventory: [],
  suppliers: [],
};

try {
  const raw = fs.readFileSync(seedPath, "utf-8");
  seedData = JSON.parse(raw);
} catch (err) {
  console.error("Failed to load demo data:", err.message);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

const state = {
  companies: clone(seedData.companies || []),
  warehouses: clone(seedData.warehouses || []),
  products: clone(seedData.products || []),
  inventory: clone(seedData.inventory || []),
  suppliers: clone(seedData.suppliers || []),
  receipts: [],
  sales: [],
  saleItems: [],
  returns: [],
  returnItems: [],
  transfers: [],
  transferItems: [],
};

const nextId = (items, field) =>
  items.reduce((max, item) => Math.max(max, item[field] || 0), 0) + 1;

const normalizeText = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const findCompanyByName = (name) => {
  const needle = normalizeText(name).toLowerCase();
  if (!needle) {
    return null;
  }
  return (
    state.companies.find(
      (company) => company.company_name.toLowerCase() === needle
    ) || null
  );
};

const findWarehouseByName = (name, companyId) => {
  const needle = normalizeText(name).toLowerCase();
  if (!needle) {
    return null;
  }
  return (
    state.warehouses.find((warehouse) => {
      if (companyId && warehouse.company_id !== companyId) {
        return false;
      }
      return warehouse.warehouse_name.toLowerCase() === needle;
    }) || null
  );
};

const findWarehouseByCode = (code) => {
  const needle = normalizeText(code).toLowerCase();
  if (!needle) {
    return null;
  }
  return (
    state.warehouses.find(
      (warehouse) => warehouse.warehouse_code.toLowerCase() === needle
    ) || null
  );
};

const findWarehouseById = (warehouseId) =>
  state.warehouses.find((warehouse) => warehouse.warehouse_id === warehouseId) ||
  null;

const findProductById = (productId) =>
  state.products.find((product) => product.product_id === productId) || null;

const ensureInventoryRecord = (warehouseId, productId) => {
  let record = state.inventory.find(
    (item) =>
      item.warehouse_id === warehouseId && item.product_id === productId
  );
  if (!record) {
    record = {
      warehouse_id: warehouseId,
      product_id: productId,
      quantity_on_hand: 0,
      quantity_reserved: 0,
    };
    state.inventory.push(record);
  }
  return record;
};

const listCompanies = () =>
  state.companies
    .filter((company) => company.is_active !== "N")
    .map((company) => ({ ...company }));

const createCompany = (payload) => {
  const companyName = normalizeText(payload.company_name);
  if (!companyName) {
    throw new Error("company_name is required");
  }
  const companyId = nextId(state.companies, "company_id");
  const company = {
    company_id: companyId,
    company_code: normalizeText(payload.company_code) || null,
    company_name: companyName,
    address: normalizeText(payload.address) || null,
    city: normalizeText(payload.city) || null,
    country: normalizeText(payload.country) || null,
    is_active: payload.is_active || "Y",
  };
  state.companies.push(company);
  return companyId;
};

const updateCompany = (companyId, payload) => {
  const company = state.companies.find(
    (item) => item.company_id === companyId
  );
  if (!company) {
    return false;
  }
  const companyName = normalizeText(payload.company_name);
  if (!companyName) {
    throw new Error("company_name is required");
  }
  company.company_code = normalizeText(payload.company_code) || null;
  company.company_name = companyName;
  company.address = normalizeText(payload.address) || null;
  company.city = normalizeText(payload.city) || null;
  company.country = normalizeText(payload.country) || null;
  company.is_active = payload.is_active || "Y";
  return true;
};

const deleteCompany = (companyId) => {
  const company = state.companies.find(
    (item) => item.company_id === companyId
  );
  if (!company) {
    return false;
  }
  company.is_active = "N";
  return true;
};

const listWarehouses = (companyId) =>
  state.warehouses
    .filter((warehouse) => warehouse.is_active !== "N")
    .filter((warehouse) =>
      companyId ? warehouse.company_id === companyId : true
    )
    .map((warehouse) => ({ ...warehouse }));

const createWarehouse = (payload) => {
  const warehouseName = normalizeText(payload.warehouse_name);
  const warehouseCode = normalizeText(payload.warehouse_code);
  const companyId = Number(payload.company_id);
  if (!warehouseName || !warehouseCode || !Number.isFinite(companyId)) {
    throw new Error(
      "warehouse_code, warehouse_name, and company_id are required"
    );
  }
  const warehouseId = nextId(state.warehouses, "warehouse_id");
  const warehouse = {
    warehouse_id: warehouseId,
    warehouse_code: warehouseCode,
    warehouse_name: warehouseName,
    company_id: companyId,
    address: normalizeText(payload.address) || null,
    city: normalizeText(payload.city) || null,
    country: normalizeText(payload.country) || null,
    is_active: payload.is_active || "Y",
  };
  state.warehouses.push(warehouse);
  return warehouseId;
};

const updateWarehouse = (warehouseId, payload) => {
  const warehouse = state.warehouses.find(
    (item) => item.warehouse_id === warehouseId
  );
  if (!warehouse) {
    return false;
  }
  const warehouseName = normalizeText(payload.warehouse_name);
  const warehouseCode = normalizeText(payload.warehouse_code);
  const companyId = Number(payload.company_id);
  if (!warehouseName || !warehouseCode || !Number.isFinite(companyId)) {
    throw new Error(
      "warehouse_code, warehouse_name, and company_id are required"
    );
  }
  warehouse.warehouse_code = warehouseCode;
  warehouse.warehouse_name = warehouseName;
  warehouse.company_id = companyId;
  warehouse.address = normalizeText(payload.address) || null;
  warehouse.city = normalizeText(payload.city) || null;
  warehouse.country = normalizeText(payload.country) || null;
  warehouse.is_active = payload.is_active || "Y";
  return true;
};

const deleteWarehouse = (warehouseId) => {
  const warehouse = state.warehouses.find(
    (item) => item.warehouse_id === warehouseId
  );
  if (!warehouse) {
    return false;
  }
  warehouse.is_active = "N";
  return true;
};

const listProducts = () =>
  state.products
    .filter((product) => product.is_active !== "N")
    .map((product) => ({ ...product }));

const getProduct = (productId) => {
  const product = findProductById(productId);
  return product ? { ...product } : null;
};

const createProduct = (payload) => {
  const productCode = normalizeText(payload.product_code);
  const productName = normalizeText(payload.product_name);
  if (!productCode || !productName || payload.unit_price === undefined) {
    throw new Error("product_code, product_name, and unit_price are required");
  }
  const productId = nextId(state.products, "product_id");
  const product = {
    product_id: productId,
    product_code: productCode,
    product_name: productName,
    barcode: normalizeText(payload.barcode) || null,
    category_id: payload.category_id || null,
    description: normalizeText(payload.description) || null,
    unit_of_measure: payload.unit_of_measure || "UNIT",
    unit_price: Number(payload.unit_price),
    cost_price:
      payload.cost_price !== undefined ? Number(payload.cost_price) : null,
    tax_rate: payload.tax_rate !== undefined ? Number(payload.tax_rate) : 0,
    is_active: payload.is_active || "Y",
  };
  state.products.push(product);
  return productId;
};

const updateProduct = (productId, payload) => {
  const product = state.products.find((item) => item.product_id === productId);
  if (!product) {
    return false;
  }
  const productCode = normalizeText(payload.product_code);
  const productName = normalizeText(payload.product_name);
  if (!productCode || !productName || payload.unit_price === undefined) {
    throw new Error("product_code, product_name, and unit_price are required");
  }
  product.product_code = productCode;
  product.product_name = productName;
  product.barcode = normalizeText(payload.barcode) || null;
  product.category_id = payload.category_id || null;
  product.description = normalizeText(payload.description) || null;
  product.unit_of_measure = payload.unit_of_measure || "UNIT";
  product.unit_price = Number(payload.unit_price);
  product.cost_price =
    payload.cost_price !== undefined ? Number(payload.cost_price) : null;
  product.tax_rate = payload.tax_rate !== undefined ? Number(payload.tax_rate) : 0;
  product.is_active = payload.is_active || "Y";
  return true;
};

const deleteProduct = (productId) => {
  const product = state.products.find((item) => item.product_id === productId);
  if (!product) {
    return false;
  }
  product.is_active = "N";
  return true;
};

const listInventory = (warehouseId) =>
  state.products
    .filter((product) => product.is_active !== "N")
    .map((product) => {
      const record = state.inventory.find(
        (item) =>
          item.warehouse_id === warehouseId &&
          item.product_id === product.product_id
      );
      return {
        product_id: product.product_id,
        product_code: product.product_code,
        product_name: product.product_name,
        barcode: product.barcode,
        unit_price: product.unit_price,
        tax_rate: product.tax_rate,
        quantity_on_hand: record ? record.quantity_on_hand : 0,
      };
    });

const getInventoryItem = (warehouseId, productId) => {
  const record = state.inventory.find(
    (item) => item.warehouse_id === warehouseId && item.product_id === productId
  );
  if (record) {
    return {
      inventory_id: record.inventory_id || null,
      product_id: record.product_id,
      warehouse_id: record.warehouse_id,
      quantity_on_hand: record.quantity_on_hand,
      quantity_reserved: record.quantity_reserved || 0,
    };
  }
  return {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity_on_hand: 0,
    quantity_reserved: 0,
  };
};

const listSuppliers = () =>
  state.suppliers
    .filter((supplier) => supplier.is_active !== "N")
    .map((supplier) => ({ ...supplier }));

const createSupplier = (payload) => {
  const supplierName = normalizeText(payload.supplier_name);
  if (!supplierName) {
    throw new Error("supplier_name is required");
  }
  const supplierId = nextId(state.suppliers, "supplier_id");
  const supplier = {
    supplier_id: supplierId,
    supplier_code: normalizeText(payload.supplier_code) || null,
    supplier_name: supplierName,
    contact_name: normalizeText(payload.contact_name) || null,
    phone_number: normalizeText(payload.phone_number) || null,
    email: normalizeText(payload.email) || null,
    tax_id: normalizeText(payload.tax_id) || null,
    address: normalizeText(payload.address) || null,
    is_active: payload.is_active || "Y",
  };
  state.suppliers.push(supplier);
  return supplierId;
};

const updateSupplier = (supplierId, payload) => {
  const supplier = state.suppliers.find(
    (item) => item.supplier_id === supplierId
  );
  if (!supplier) {
    return false;
  }
  const supplierName = normalizeText(payload.supplier_name);
  if (!supplierName) {
    throw new Error("supplier_name is required");
  }
  supplier.supplier_code = normalizeText(payload.supplier_code) || null;
  supplier.supplier_name = supplierName;
  supplier.contact_name = normalizeText(payload.contact_name) || null;
  supplier.phone_number = normalizeText(payload.phone_number) || null;
  supplier.email = normalizeText(payload.email) || null;
  supplier.tax_id = normalizeText(payload.tax_id) || null;
  supplier.address = normalizeText(payload.address) || null;
  supplier.is_active = payload.is_active || "Y";
  return true;
};

const deleteSupplier = (supplierId) => {
  const supplier = state.suppliers.find(
    (item) => item.supplier_id === supplierId
  );
  if (!supplier) {
    return false;
  }
  supplier.is_active = "N";
  return true;
};

const receiveStock = ({ warehouseId, productId, quantity, supplierId, userId }) => {
  const product = findProductById(productId);
  if (!product) {
    throw new Error("product not found");
  }
  const warehouse = findWarehouseById(warehouseId);
  if (!warehouse) {
    throw new Error("warehouse not found");
  }
  const record = ensureInventoryRecord(warehouseId, productId);
  record.quantity_on_hand += quantity;
  record.last_movement_at = new Date().toISOString();

  const receipt = {
    receipt_id: nextId(state.receipts, "receipt_id"),
    receipt_number: `RCV-${Date.now().toString().slice(-8)}`,
    warehouse_id: warehouseId,
    product_id: productId,
    supplier_id: supplierId || null,
    quantity,
    received_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    created_by: userId || null,
  };
  state.receipts.push(receipt);
  return receipt;
};

const adjustStock = ({ warehouseId, productId, quantity }) => {
  const product = findProductById(productId);
  if (!product) {
    throw new Error("product not found");
  }
  const warehouse = findWarehouseById(warehouseId);
  if (!warehouse) {
    throw new Error("warehouse not found");
  }
  const record = ensureInventoryRecord(warehouseId, productId);
  record.quantity_on_hand = quantity;
  record.last_movement_at = new Date().toISOString();
  return record;
};

const createSale = (payload) => {
  const warehouseId = Number(payload.warehouse_id);
  if (!Number.isFinite(warehouseId)) {
    throw new Error("warehouse_id is required");
  }
  const warehouse = findWarehouseById(warehouseId);
  if (!warehouse) {
    throw new Error("warehouse not found");
  }

  const saleId = nextId(state.sales, "sale_id");
  const saleNumber =
    normalizeText(payload.sale_number) ||
    `SALE-${Date.now().toString().slice(-8)}`;
  const sale = {
    sale_id: saleId,
    sale_number: saleNumber,
    sale_datetime: new Date().toISOString(),
    customer_id: payload.customer_id || null,
    cashier_id: payload.cashier_id || null,
    warehouse_id: warehouseId,
    gross_amount: payload.gross_amount || 0,
    discount_amount: payload.discount_amount || 0,
    tax_amount: payload.tax_amount || 0,
    total_amount: payload.total_amount || 0,
    payment_status: payload.payment_status || "UNPAID",
    status: payload.status || "COMPLETED",
    notes: payload.notes || null,
  };

  for (const item of payload.items || []) {
    const record = ensureInventoryRecord(warehouseId, item.product_id);
    if (record.quantity_on_hand < item.quantity) {
      throw new Error(`Insufficient inventory for product_id ${item.product_id}`);
    }
  }

  for (const item of payload.items || []) {
    const record = ensureInventoryRecord(warehouseId, item.product_id);
    record.quantity_on_hand -= item.quantity;
  }

  state.sales.push(sale);
  (payload.items || []).forEach((item) => {
    state.saleItems.push({
      sale_id: saleId,
      line_number: item.line_number,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount,
      tax_amount: item.tax_amount,
      line_total: item.line_total,
    });
  });

  return sale;
};

const createReturn = (payload) => {
  const warehouseId = Number(payload.warehouse_id);
  if (!Number.isFinite(warehouseId)) {
    throw new Error("warehouse_id is required");
  }
  const warehouse = findWarehouseById(warehouseId);
  if (!warehouse) {
    throw new Error("warehouse not found");
  }

  const returnId = nextId(state.returns, "return_id");
  const returnNumber =
    normalizeText(payload.return_number) ||
    `RET-${Date.now().toString().slice(-8)}`;
  const returnRecord = {
    return_id: returnId,
    return_number: returnNumber,
    sale_id: payload.sale_id || null,
    warehouse_id: warehouseId,
    cashier_id: payload.cashier_id || null,
    reason: payload.reason || null,
    status: payload.status || "COMPLETED",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  for (const item of payload.items || []) {
    const record = ensureInventoryRecord(warehouseId, item.product_id);
    record.quantity_on_hand += item.quantity;
    state.returnItems.push({
      return_id: returnId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price || null,
      tax_amount: item.tax_amount || 0,
      line_total: item.line_total || null,
    });
  }

  state.returns.push(returnRecord);
  return returnRecord;
};

const listReturns = (warehouseId) =>
  state.returns
    .filter((item) => (warehouseId ? item.warehouse_id === warehouseId : true))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((item) => ({ ...item }));

const listReceipts = (warehouseId) =>
  state.receipts
    .filter((receipt) => receipt.warehouse_id === warehouseId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .map((receipt) => {
      const product = findProductById(receipt.product_id);
      const supplier = state.suppliers.find(
        (item) => item.supplier_id === receipt.supplier_id
      );
      return {
        receipt_number: receipt.receipt_number,
        quantity: receipt.quantity,
        received_at: receipt.received_at,
        product_name: product ? product.product_name : null,
        supplier_name: supplier ? supplier.supplier_name : null,
      };
    });

const listTransfers = ({ status, direction, warehouseId }) => {
  let transfers = state.transfers.slice();

  if (status) {
    transfers = transfers.filter((transfer) => transfer.status === status);
  }

  if (warehouseId) {
    if (direction === "incoming") {
      transfers = transfers.filter(
        (transfer) => transfer.to_warehouse_id === warehouseId
      );
    } else if (direction === "outgoing") {
      transfers = transfers.filter(
        (transfer) => transfer.from_warehouse_id === warehouseId
      );
    } else {
      transfers = transfers.filter(
        (transfer) =>
          transfer.from_warehouse_id === warehouseId ||
          transfer.to_warehouse_id === warehouseId
      );
    }
  }

  return transfers
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((transfer) => {
      const fromWarehouse = findWarehouseById(transfer.from_warehouse_id);
      const toWarehouse = findWarehouseById(transfer.to_warehouse_id);
      const items = state.transferItems
        .filter((item) => item.transfer_id === transfer.transfer_id)
        .map((item) => {
          const product = findProductById(item.product_id);
          return {
            product_id: item.product_id,
            product_name: product ? product.product_name : null,
            quantity: item.quantity,
          };
        });
      return {
        transfer_id: transfer.transfer_id,
        transfer_number: transfer.transfer_number,
        company_id: transfer.company_id,
        from_warehouse_id: transfer.from_warehouse_id,
        to_warehouse_id: transfer.to_warehouse_id,
        from_warehouse_name: fromWarehouse ? fromWarehouse.warehouse_name : null,
        to_warehouse_name: toWarehouse ? toWarehouse.warehouse_name : null,
        status: transfer.status,
        notes: transfer.notes || null,
        requested_by: transfer.requested_by || null,
        approved_by: transfer.approved_by || null,
        approved_at: transfer.approved_at || null,
        created_at: transfer.created_at,
        updated_at: transfer.updated_at,
        items,
      };
    });
};

const createTransfer = (payload) => {
  const fromWarehouseId = Number(payload.from_warehouse_id);
  const toWarehouseId = Number(payload.to_warehouse_id);
  if (!Number.isFinite(fromWarehouseId) || !Number.isFinite(toWarehouseId)) {
    throw new Error("from_warehouse_id and to_warehouse_id are required");
  }
  if (fromWarehouseId === toWarehouseId) {
    throw new Error("from_warehouse_id and to_warehouse_id must differ");
  }

  const fromWarehouse = findWarehouseById(fromWarehouseId);
  const toWarehouse = findWarehouseById(toWarehouseId);
  if (!fromWarehouse || !toWarehouse) {
    throw new Error("invalid warehouse selection");
  }
  if (fromWarehouse.company_id !== toWarehouse.company_id) {
    throw new Error("warehouses must belong to the same company");
  }

  const transferId = nextId(state.transfers, "transfer_id");
  const transferNumber =
    normalizeText(payload.transfer_number) ||
    `TRF-${Date.now().toString().slice(-8)}`;
  const transfer = {
    transfer_id: transferId,
    transfer_number: transferNumber,
    company_id: fromWarehouse.company_id,
    from_warehouse_id: fromWarehouseId,
    to_warehouse_id: toWarehouseId,
    status: "PENDING",
    notes: payload.notes || null,
    requested_by: payload.requested_by || null,
    approved_by: null,
    approved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  state.transfers.push(transfer);
  (payload.items || []).forEach((item) => {
    state.transferItems.push({
      transfer_id: transferId,
      product_id: item.product_id,
      quantity: item.quantity,
    });
  });

  return transfer;
};

const approveTransfer = (transferId, approvedBy) => {
  const transfer = state.transfers.find(
    (item) => item.transfer_id === transferId
  );
  if (!transfer) {
    return null;
  }
  if (transfer.status !== "PENDING") {
    throw new Error("transfer is not pending");
  }

  const items = state.transferItems.filter(
    (item) => item.transfer_id === transferId
  );
  for (const item of items) {
    const record = ensureInventoryRecord(
      transfer.from_warehouse_id,
      item.product_id
    );
    if (record.quantity_on_hand < item.quantity) {
      throw new Error(`Insufficient stock for product_id ${item.product_id}`);
    }
  }

  for (const item of items) {
    const fromRecord = ensureInventoryRecord(
      transfer.from_warehouse_id,
      item.product_id
    );
    const toRecord = ensureInventoryRecord(
      transfer.to_warehouse_id,
      item.product_id
    );
    fromRecord.quantity_on_hand -= item.quantity;
    toRecord.quantity_on_hand += item.quantity;
  }

  transfer.status = "COMPLETED";
  transfer.approved_by = approvedBy || null;
  transfer.approved_at = new Date().toISOString();
  transfer.updated_at = new Date().toISOString();
  return transfer;
};

const rejectTransfer = (transferId, approvedBy) => {
  const transfer = state.transfers.find(
    (item) => item.transfer_id === transferId
  );
  if (!transfer) {
    return null;
  }
  if (transfer.status !== "PENDING") {
    return null;
  }
  transfer.status = "REJECTED";
  transfer.approved_by = approvedBy || null;
  transfer.approved_at = new Date().toISOString();
  transfer.updated_at = new Date().toISOString();
  return transfer;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const getPosReport = (warehouseId) => {
  const start = startOfToday();
  const sales = state.sales.filter(
    (sale) =>
      sale.warehouse_id === warehouseId &&
      new Date(sale.sale_datetime) >= start
  );
  const returns = state.returns.filter(
    (ret) =>
      ret.warehouse_id === warehouseId && new Date(ret.created_at) >= start
  );

  const totalSales = sales.reduce(
    (sum, sale) => sum + Number(sale.total_amount || 0),
    0
  );

  const lowStock = state.inventory
    .filter((item) => item.warehouse_id === warehouseId)
    .filter((item) => item.quantity_on_hand <= 10)
    .map((item) => {
      const product = findProductById(item.product_id);
      const warehouse = findWarehouseById(warehouseId);
      return {
        product_name: product ? product.product_name : null,
        quantity_on_hand: item.quantity_on_hand,
        warehouse_name: warehouse ? warehouse.warehouse_name : null,
      };
    })
    .sort((a, b) => a.quantity_on_hand - b.quantity_on_hand)
    .slice(0, 10);

  const recentSales = sales
    .slice()
    .sort((a, b) => new Date(b.sale_datetime) - new Date(a.sale_datetime))
    .slice(0, 10)
    .map((sale) => ({
      sale_number: sale.sale_number,
      cashier_id: sale.cashier_id,
      total_amount: sale.total_amount,
      status: sale.status,
    }));

  const reasonMap = new Map();
  returns.forEach((ret) => {
    const reason = ret.reason || "Unspecified";
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
  });

  const returnReasons = Array.from(reasonMap.entries())
    .map(([reason, total]) => ({ reason, total }))
    .sort((a, b) => b.total - a.total);

  return {
    totals: {
      total_sales: totalSales,
      returns_count: returns.length,
    },
    low_stock: lowStock,
    recent_sales: recentSales,
    return_reasons: returnReasons,
  };
};

const getWarehouseReport = (warehouseId) => {
  const inventory = state.inventory.filter(
    (item) => item.warehouse_id === warehouseId
  );
  const lowStockItems = inventory.filter(
    (item) => item.quantity_on_hand <= 10
  );
  const pendingTransfers = state.transfers.filter(
    (transfer) =>
      transfer.to_warehouse_id === warehouseId && transfer.status === "PENDING"
  );
  const totalUnits = inventory.reduce(
    (sum, item) => sum + Number(item.quantity_on_hand || 0),
    0
  );

  const alerts = lowStockItems
    .slice()
    .sort((a, b) => a.quantity_on_hand - b.quantity_on_hand)
    .slice(0, 5)
    .map((item) => {
      const product = findProductById(item.product_id);
      return {
        product_name: product ? product.product_name : null,
        quantity_on_hand: item.quantity_on_hand,
      };
    });

  return {
    totals: {
      low_stock: lowStockItems.length,
      pending_transfers: pendingTransfers.length,
      total_units: totalUnits,
    },
    alerts,
  };
};

const seedDemoTransactions = () => {
  if (state.sales.length || state.returns.length || state.transfers.length) {
    return;
  }

  const sampleSale = createSale({
    sale_number: "SALE-1001",
    customer_id: null,
    cashier_id: 1,
    warehouse_id: 1,
    gross_amount: 31.0,
    discount_amount: 0,
    tax_amount: 2.48,
    total_amount: 33.48,
    payment_status: "PAID",
    status: "COMPLETED",
    notes: "Demo sale",
    items: [
      {
        line_number: 1,
        product_id: 101,
        quantity: 2,
        unit_price: 15.5,
        discount_amount: 0,
        tax_amount: 2.48,
        line_total: 33.48,
      },
    ],
  });

  createReturn({
    return_number: "RET-1001",
    sale_id: sampleSale.sale_id,
    warehouse_id: 1,
    cashier_id: 1,
    reason: "Damaged packaging",
    status: "COMPLETED",
    items: [
      {
        product_id: 101,
        quantity: 1,
        unit_price: 15.5,
        tax_amount: 1.24,
        line_total: 16.74,
      },
    ],
  });

  receiveStock({
    warehouseId: 1,
    productId: 102,
    quantity: 15,
    supplierId: 2,
    userId: 1,
  });

  createTransfer({
    transfer_number: "TRF-1001",
    from_warehouse_id: 1,
    to_warehouse_id: 2,
    notes: "Restock Acme East",
    requested_by: 2,
    items: [
      { product_id: 102, quantity: 5 },
      { product_id: 104, quantity: 4 },
    ],
  });
};

seedDemoTransactions();

module.exports = {
  useLocalData,
  localData: {
    findCompanyByName,
    findWarehouseByName,
    findWarehouseByCode,
    listCompanies,
    createCompany,
    updateCompany,
    deleteCompany,
    listWarehouses,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse,
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    listInventory,
    getInventoryItem,
    listSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    receiveStock,
    adjustStock,
    createSale,
    createReturn,
    listReturns,
    listReceipts,
    listTransfers,
    createTransfer,
    approveTransfer,
    rejectTransfer,
    getPosReport,
    getWarehouseReport,
  },
};
