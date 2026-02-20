import { useEffect, useState } from 'react';
import { fetchConnections, createConnection, updateConnection, activateConnection, deleteConnection, testConnection, type Connection } from '../api';
import { Settings, Save, Plus, Trash2, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

export const ConfigurationPanel: React.FC = () => {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Empty defaults as requested
    const [newConn, setNewConn] = useState<Connection>({
        name: '',
        provider: 'openai',
        model_name: '',
        api_key: ''
    });

    const loadConnections = async () => {
        setLoading(true);
        try {
            const data = await fetchConnections();
            setConnections(data);
        } catch (err) {
            console.error("Failed to load connections", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConnections();
    }, []);

    const handleSaveNew = async () => {
        if (!newConn.name || !newConn.model_name) {
            alert("Name and Model Name are required.");
            return;
        }

        setIsTesting(true);
        try {
            await testConnection(newConn);
        } catch (err: any) {
            alert(`Connection test failed: ${err.message}`);
            setIsTesting(false);
            return;
        }

        try {
            if (editingId) {
                await updateConnection(editingId, newConn);
            } else {
                await createConnection(newConn);
            }
            setIsAdding(false);
            setEditingId(null);
            setNewConn({ name: '', provider: 'openai', model_name: '', api_key: '' });
            await loadConnections();
        } catch (err: any) {
            alert(`Failed to save connection: ${err.message}`);
        } finally {
            setIsTesting(false);
        }
    };

    const handleEdit = (conn: Connection) => {
        setNewConn({ name: conn.name, provider: conn.provider, model_name: conn.model_name, api_key: conn.api_key || '' });
        setEditingId(conn.id as number);
        setIsAdding(true);
    };

    const handleActivate = async (id: number) => {
        await activateConnection(id);
        await loadConnections();
    };

    const handleDelete = async (id: number) => {
        if (confirm("Are you sure you want to delete this connection?")) {
            await deleteConnection(id);
            await loadConnections();
        }
    };

    if (loading && connections.length === 0) {
        return <div className="p-8 text-center text-slate-500 animate-pulse">Loading connections...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-800">
                    <Settings className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-bold">Saved Connections</h3>
                </div>
                {!isAdding && (
                    <button
                        onClick={() => {
                            setEditingId(null);
                            setNewConn({ name: '', provider: 'openai', model_name: '', api_key: '' });
                            setIsAdding(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-semibold"
                    >
                        <Plus className="w-4 h-4" /> Add New
                    </button>
                )}
            </div>

            {connections.length === 0 && !isAdding && (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-500 bg-slate-50/50">
                    No connections saved. Please add one to use the AI features.
                </div>
            )}

            <div className="space-y-3">
                {connections.map(conn => (
                    <div
                        key={conn.id}
                        className={clsx(
                            "flex items-center justify-between p-4 rounded-xl border transition-all duration-200 group",
                            conn.is_active
                                ? "bg-indigo-50/50 border-indigo-200 shadow-sm shadow-indigo-100"
                                : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => conn.id && handleActivate(conn.id)}
                                className="focus:outline-none"
                                title="Click to activate"
                            >
                                {conn.is_active ? (
                                    <CheckCircle2 className="w-6 h-6 text-indigo-600" />
                                ) : (
                                    <Circle className="w-6 h-6 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                )}
                            </button>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-slate-800">{conn.name}</h4>
                                    {conn.is_active && (
                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] uppercase font-bold tracking-wider rounded-md">Active</span>
                                    )}
                                </div>
                                <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-2">
                                    <span className="capitalize">{conn.provider}</span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                    <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{conn.model_name}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => handleEdit(conn)}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Configuration"
                            >
                                <Settings className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => conn.id && handleDelete(conn.id)}
                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete Configuration"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        className="bg-slate-50 p-6 rounded-2xl border border-slate-200"
                    >
                        <h4 className="font-bold text-slate-800 mb-4 inline-flex items-center gap-2">
                            {editingId ? <Settings className="w-4 h-4 text-indigo-600" /> : <Plus className="w-4 h-4 text-indigo-600" />}
                            {editingId ? "Edit Connection" : "Create New Connection"}
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Connection Name</label>
                                <input
                                    type="text"
                                    value={newConn.name}
                                    onChange={e => setNewConn({ ...newConn, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                    placeholder="e.g. My Prod OpenAI"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Provider</label>
                                <select
                                    value={newConn.provider}
                                    onChange={e => setNewConn({ ...newConn, provider: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                >
                                    <option value="openai">OpenAI</option>
                                    <option value="gemini">Google Gemini</option>
                                    <option value="ollama">Ollama (Local)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Model Name</label>
                                <input
                                    type="text"
                                    value={newConn.model_name}
                                    onChange={e => setNewConn({ ...newConn, model_name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                    placeholder="e.g. gpt-4o"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">API Key <span className="text-slate-400 font-normal">(Optional)</span></label>
                                <input
                                    type="password"
                                    value={newConn.api_key || ''}
                                    onChange={e => setNewConn({ ...newConn, api_key: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                    placeholder="sk-..."
                                />
                            </div>
                        </div>

                        <div className="pt-3 flex justify-end gap-3 border-t border-slate-200">
                            <button
                                onClick={() => {
                                    setIsAdding(false);
                                    setEditingId(null);
                                }}
                                className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveNew}
                                disabled={isTesting}
                                className={clsx("flex items-center gap-2 px-6 py-2 text-white font-medium rounded-lg transition-all outline-none focus:ring-4 focus:ring-indigo-100",
                                    isTesting ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5"
                                )}
                            >
                                {isTesting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Testing & Saving...</>
                                ) : (
                                    <><Save className="w-4 h-4" /> {editingId ? "Save Changes" : "Add Connection"}</>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
