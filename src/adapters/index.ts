export interface AdapterPayload {
    task_id: string;
    payload: any;
}

export abstract class BaseAdapter {
    abstract adapt(task: any): AdapterPayload;
}

export class AdapterFactory {
    static get_adapter(adapter_type: string): BaseAdapter {
        if (adapter_type !== 'openclaw' && adapter_type !== 'hermes_mcp') {
            throw new Error(`Unsupported adapter type: ${adapter_type}`);
        }
        return {
            adapt: (task: any) => ({ task_id: task.id, payload: { ...task } })
        } as BaseAdapter;
    }
}
