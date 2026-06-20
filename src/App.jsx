import { useEffect, useMemo, useState } from "react";
import { ErrorMessage, Field, Form, Formik } from "formik";
import * as Yup from "yup";
import {
  Download,
  Edit2,
  Moon,
  PackagePlus,
  Plus,
  Search,
  Sun,
  Trash2,
} from "lucide-react";

const PRODUCT_KEY = "inventory_products";
const CATEGORY_KEY = "inventory_categories";
const THEME_KEY = "inventory_theme";
const HISTORY_KEY = "inventory_stock_history";

const defaultCategories = ["Electronics", "Stationery", "Groceries"];

const readStorage = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const generateSku = () => `PRD-${Math.floor(100000 + Math.random() * 900000)}`;

const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

const productSchema = (products, editingId) =>
  Yup.object({
    name: Yup.string().trim().required("Product name is required"),
    sku: Yup.string()
      .trim()
      .required("Product ID is required")
      .test("unique-sku", "Product ID must be unique", (value) => {
        if (!value) return false;
        return !products.some(
          (product) =>
            product.sku.toLowerCase() === value.toLowerCase() &&
            product.id !== editingId
        );
      }),
    category: Yup.string().required("Category is required"),
    price: Yup.number()
      .typeError("Price must be a number")
      .positive("Price must be greater than zero")
      .required("Price is required"),
    stock: Yup.number()
      .typeError("Stock quantity must be a number")
      .integer("Stock quantity must be a whole number")
      .min(0, "Stock cannot be negative")
      .required("Stock quantity is required"),
  });

const categorySchema = (categories) =>
  Yup.object({
    categoryName: Yup.string()
      .trim()
      .required("Category name is required")
      .test("unique-category", "Category already exists", (value) => {
        if (!value) return false;
        return !categories.some(
          (category) => category.toLowerCase() === value.toLowerCase()
        );
      }),
  });

function App() {
  const [products, setProducts] = useState(() => readStorage(PRODUCT_KEY, []));
  const [categories, setCategories] = useState(() =>
    readStorage(CATEGORY_KEY, defaultCategories)
  );
  const [history, setHistory] = useState(() => readStorage(HISTORY_KEY, []));
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    localStorage.setItem(PRODUCT_KEY, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const editingProduct = products.find((product) => product.id === editingId);

  const productInitialValues = editingProduct
    ? {
        name: editingProduct.name,
        sku: editingProduct.sku,
        category: editingProduct.category,
        price: editingProduct.price,
        stock: editingProduct.stock,
      }
    : {
        name: "",
        sku: generateSku(),
        category: categories[0] || "",
        price: "",
        stock: "",
      };

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesQuery =
        !normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.sku.toLowerCase().includes(normalizedQuery);
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in" && product.stock > 0) ||
        (stockFilter === "out" && product.stock === 0);

      return matchesQuery && matchesCategory && matchesStock;
    });
  }, [products, query, categoryFilter, stockFilter]);

  const stats = useMemo(() => {
    const totalValue = products.reduce(
      (sum, product) => sum + Number(product.price) * Number(product.stock),
      0
    );
    const categoryCounts = categories.map((category) => ({
      category,
      count: products.filter((product) => product.category === category).length,
    }));
    const maxCategoryCount = Math.max(1, ...categoryCounts.map((item) => item.count));

    return {
      totalProducts: products.length,
      totalValue,
      inStock: products.filter((product) => product.stock > 0).length,
      outOfStock: products.filter((product) => product.stock === 0).length,
      categoryCounts,
      maxCategoryCount,
    };
  }, [categories, products]);

  const resetEditing = () => setEditingId(null);

  const addHistoryEntry = (product, change, action) => {
    setHistory((current) => [
      {
        id: crypto.randomUUID(),
        sku: product.sku,
        productName: product.name,
        change,
        action,
        timestamp: new Date().toISOString(),
      },
      ...current,
    ]);
  };

  const saveProduct = (values, helpers) => {
    const productPayload = {
      id: editingId || crypto.randomUUID(),
      name: values.name.trim(),
      sku: values.sku.trim(),
      category: values.category,
      price: Number(values.price),
      stock: Number(values.stock),
    };

    if (editingId) {
      setProducts((current) =>
        current.map((product) =>
          product.id === editingId ? productPayload : product
        )
      );
      resetEditing();
    } else {
      setProducts((current) => [...current, productPayload]);
    }

    helpers.resetForm({
      values: {
        name: "",
        sku: generateSku(),
        category: categories[0] || "",
        price: "",
        stock: "",
      },
    });
  };

  const deleteProduct = (productId) => {
    setProducts((current) => current.filter((product) => product.id !== productId));
    setSelectedIds((current) => current.filter((id) => id !== productId));
    if (editingId === productId) resetEditing();
  };

  const updateStock = (productId, change) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    const nextStock = Math.max(0, Number(product.stock) + change);
    const actualChange = nextStock - Number(product.stock);
    if (actualChange === 0) return;

    addHistoryEntry(
      product,
      actualChange,
      actualChange > 0 ? "Restock" : "Outgoing"
    );
    setProducts((current) =>
      current.map((item) =>
        item.id === productId ? { ...item, stock: nextStock } : item
      )
    );
  };

  const toggleSelected = (productId) => {
    setSelectedIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredProducts.map((product) => product.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
    }
  };

  const bulkDelete = () => {
    setProducts((current) =>
      current.filter((product) => !selectedIds.includes(product.id))
    );
    if (selectedIds.includes(editingId)) resetEditing();
    setSelectedIds([]);
  };

  const bulkRestock = () => {
    selectedIds.forEach((id) => updateStock(id, 1));
  };

  const exportCsv = () => {
    const header = ["Product ID", "Product Name", "Category", "Price", "Stock"];
    const rows = products.map((product) => [
      product.sku,
      product.name,
      product.category,
      product.price,
      product.stock,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-products.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Inventory overview">
        <div>
          <p className="eyebrow">Inventory Management System</p>
          <h1>Products, stock, and categories</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={exportCsv} title="Export products">
            <Download size={18} />
            <span>CSV</span>
          </button>
          <button
            className="icon-button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title="Toggle theme"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button>
        </div>
      </section>

      <section className="stats-grid" aria-label="Dashboard statistics">
        <Stat label="Total products" value={stats.totalProducts} />
        <Stat label="Inventory value" value={formatMoney(stats.totalValue)} />
        <Stat label="In stock" value={stats.inStock} />
        <Stat label="Out of stock" value={stats.outOfStock} />
      </section>

      <section className="workspace">
        <div className="panel form-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{editingProduct ? "Edit product" : "Add product"}</p>
              <h2>{editingProduct ? editingProduct.name : "Product details"}</h2>
            </div>
            {editingProduct && (
              <button className="text-button" onClick={resetEditing}>
                Cancel
              </button>
            )}
          </div>

          <Formik
            enableReinitialize
            initialValues={productInitialValues}
            validationSchema={productSchema(products, editingId)}
            onSubmit={saveProduct}
          >
            {({ setFieldValue, isSubmitting }) => (
              <Form className="form-grid">
                <FormField label="Product name" name="name" />
                <div className="field-group">
                  <label htmlFor="sku">Product ID</label>
                  <div className="sku-row">
                    <Field id="sku" name="sku" />
                    <button
                      type="button"
                      className="icon-only"
                      title="Generate product ID"
                      onClick={() => setFieldValue("sku", generateSku())}
                    >
                      <PackagePlus size={18} />
                    </button>
                  </div>
                  <ErrorMessage component="div" className="error" name="sku" />
                </div>
                <div className="field-group">
                  <label htmlFor="category">Category</label>
                  <Field as="select" id="category" name="category">
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Field>
                  <ErrorMessage component="div" className="error" name="category" />
                </div>
                <FormField label="Price" name="price" type="number" min="0" step="0.01" />
                <FormField
                  label="Stock quantity"
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                />
                <button className="primary-button" type="submit" disabled={isSubmitting}>
                  {editingProduct ? "Save product" : "Add product"}
                </button>
              </Form>
            )}
          </Formik>

          <div className="divider" />

          <Formik
            initialValues={{ categoryName: "" }}
            validationSchema={categorySchema(categories)}
            onSubmit={(values, helpers) => {
              setCategories((current) => [...current, values.categoryName.trim()]);
              helpers.resetForm();
            }}
          >
            <Form className="category-form">
              <FormField label="New category" name="categoryName" />
              <button className="secondary-button" type="submit">
                <Plus size={16} />
                Add category
              </button>
            </Form>
          </Formik>
        </div>

        <div className="panel product-panel">
          <div className="section-heading list-heading">
            <div>
              <p className="eyebrow">Product list</p>
              <h2>{filteredProducts.length} visible</h2>
            </div>
            <div className="bulk-actions">
              <button
                className="secondary-button compact"
                disabled={selectedIds.length === 0}
                onClick={bulkRestock}
              >
                Restock selected
              </button>
              <button
                className="danger-button compact"
                disabled={selectedIds.length === 0}
                onClick={bulkDelete}
              >
                Delete selected
              </button>
            </div>
          </div>

          <div className="filters">
            <div className="search-box">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or Product ID"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              aria-label="Filter by stock status"
            >
              <option value="all">All stock</option>
              <option value="in">In Stock</option>
              <option value="out">Out of Stock</option>
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={
                        filteredProducts.length > 0 &&
                        filteredProducts.every((product) =>
                          selectedIds.includes(product.id)
                        )
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all visible products"
                    />
                  </th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td className="select-cell" data-label="Select">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleSelected(product.id)}
                        aria-label={`Select ${product.name}`}
                      />
                    </td>
                    <td className="product-cell" data-label="Product">
                      <div className="product-name">{product.name}</div>
                      <div className="muted">{product.sku}</div>
                    </td>
                    <td data-label="Category">{product.category}</td>
                    <td data-label="Price">{formatMoney(product.price)}</td>
                    <td data-label="Stock">
                      <div className="stock-controls">
                        <button
                          className="mini-button"
                          onClick={() => updateStock(product.id, -1)}
                          disabled={product.stock === 0}
                          title="Decrease stock"
                        >
                          -
                        </button>
                        <span>{product.stock}</span>
                        <button
                          className="mini-button"
                          onClick={() => updateStock(product.id, 1)}
                          title="Increase stock"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={product.stock > 0 ? "pill ok" : "pill empty"}>
                        {product.stock > 0 ? "In Stock" : "Out of Stock"}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <div className="row-actions">
                        <button
                          className="icon-only"
                          onClick={() => setEditingId(product.id)}
                          title="Edit product"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="icon-only danger"
                          onClick={() => deleteProduct(product.id)}
                          title="Delete product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      No products match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Categories</p>
              <h2>Product count</h2>
            </div>
          </div>
          <div className="category-chart">
            {stats.categoryCounts.map((item) => (
              <div className="bar-row" key={item.category}>
                <div className="bar-label">
                  <span>{item.category}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(item.count / stats.maxCategoryCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Stock history</p>
              <h2>Latest changes</h2>
            </div>
          </div>
          <div className="history-list">
            {history.slice(0, 8).map((entry) => (
              <div className="history-item" key={entry.id}>
                <div>
                  <strong>{entry.productName}</strong>
                  <span>{entry.sku}</span>
                </div>
                <div className="history-meta">
                  <span className={entry.change > 0 ? "change-up" : "change-down"}>
                    {entry.change > 0 ? `+${entry.change}` : entry.change}
                  </span>
                  <time dateTime={entry.timestamp}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </time>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <p className="muted">Stock changes will appear here.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FormField({ label, name, ...props }) {
  return (
    <div className="field-group">
      <label htmlFor={name}>{label}</label>
      <Field id={name} name={name} {...props} />
      <ErrorMessage component="div" className="error" name={name} />
    </div>
  );
}

export default App;
