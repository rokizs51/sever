/**
 * Generic Supabase stub for testing.
 * Records all calls and returns scripted responses.
 * Reusable across multiple tasks.
 */

export interface SupaStubResponse {
  data?: any;
  error?: any;
}

export interface FromCall {
  table: string;
  method: string;
  args?: any;
}

export interface RpcCall {
  fn: string;
  params: any;
}

export interface SupaStubCalls {
  from: FromCall[];
  rpc: RpcCall[];
}

export interface SupaStub {
  from(table: string): ChainBuilder;
  rpc(fn: string, params: any): Promise<SupaStubResponse>;
  auth: { signOut(): Promise<{ error: null }> };
  calls: SupaStubCalls;
}

export interface ChainBuilder {
  insert(data: any): ChainBuilder;
  select(columns?: string): ChainBuilder;
  eq(column: string, value: any): ChainBuilder;
  lt(column: string, value: any): ChainBuilder;
  order(column: string, opts?: { ascending?: boolean }): ChainBuilder;
  update(data: any): ChainBuilder;
  delete(): ChainBuilder;
  single(): Promise<SupaStubResponse>;
  maybeSingle(): Promise<SupaStubResponse>;
}

export interface SupaStubConfig {
  from?: Record<string, SupaStubResponse>;
  rpc?: Record<string, SupaStubResponse>;
}

/**
 * Creates a fake Supabase client that records all calls and returns scripted responses.
 * 
 * @example
 * const supa = createSupaStub({
 *   from: {
 *     job_descriptions: { data: { id: 'jd-1', owner: 'user-1', raw: '...', extraction: {...}, created_at: '...' }, error: null }
 *   },
 *   rpc: {
 *     month_llm_cost: { data: 1000, error: null }
 *   }
 * });
 * 
 * // Use in tests
 * const result = await supa.from('job_descriptions').insert({ owner: 'user-1' }).select('*').single();
 * expect(supa.calls.from.length).toBeGreaterThan(0);
 */
export function createSupaStub(config: SupaStubConfig = {}): SupaStub {
  const calls: SupaStubCalls = {
    from: [],
    rpc: [],
  };

  const fromConfig = config.from || {};
  const rpcConfig = config.rpc || {};

  return {
    calls,

    from(table: string): ChainBuilder {
      let lastInsertData: any = null;
      let hasSelect = false;
      const builder: any = {
        insert(data: any): ChainBuilder {
          calls.from.push({ table, method: 'insert', args: data });
          lastInsertData = data;
          return builder;
        },
        select(columns?: string): ChainBuilder {
          calls.from.push({ table, method: 'select', args: columns });
          hasSelect = true;
          return builder;
        },
        eq(column: string, value: any): ChainBuilder {
          calls.from.push({ table, method: 'eq', args: { column, value } });
          return builder;
        },
        lt(column: string, value: any): ChainBuilder {
          calls.from.push({ table, method: 'lt', args: { column, value } });
          return builder;
        },
        order(column: string, opts?: { ascending?: boolean }): ChainBuilder {
          calls.from.push({ table, method: 'order', args: { column, opts } });
          return builder;
        },
        update(data: any): ChainBuilder {
          calls.from.push({ table, method: 'update', args: data });
          return builder;
        },
        delete(): ChainBuilder {
          calls.from.push({ table, method: 'delete', args: undefined });
          return builder;
        },
        async single(): Promise<SupaStubResponse> {
          calls.from.push({ table, method: 'single' });
          
          // If there was an insert
          if (lastInsertData) {
            // Check if there's a configured response for this table
            const tableConfig = fromConfig[table];
            
            // If there's a configured response and a select was called, use the configured ID
            if (hasSelect && tableConfig && tableConfig.data) {
              const result = {
                data: {
                  ...lastInsertData,
                  id: tableConfig.data.id, // Use the configured ID
                  created_at: tableConfig.data.created_at || new Date().toISOString(),
                  updated_at: tableConfig.data.updated_at || new Date().toISOString(),
                },
                error: null,
              };
              lastInsertData = null;
              return result;
            }
            
            // Otherwise, return the inserted data with generated fields
            const result = {
              data: {
                ...lastInsertData,
                id: lastInsertData.id || 'generated-id',
                created_at: lastInsertData.created_at || new Date().toISOString(),
                updated_at: lastInsertData.updated_at || new Date().toISOString(),
              },
              error: null,
            };
            lastInsertData = null;
            return result;
          }
          
          // No insert, so this is a read operation - return configured response
          const tableConfig = fromConfig[table];
          if (tableConfig) {
            return tableConfig;
          }
          
          // Default: no data, no error
          return { data: null, error: null };
        },
        async maybeSingle(): Promise<SupaStubResponse> {
          const r = await builder.single();
          const row = Array.isArray(r.data) ? (r.data as any[])[0] ?? null : r.data ?? null;
          return { data: row, error: r.error ?? null };
        },
        // Make the builder thenable so it can be awaited
        then(resolve: any, reject: any) {
          const tableConfig = fromConfig[table];
          if (tableConfig) {
            resolve(tableConfig);
          } else {
            resolve({ data: null, error: null });
          }
        },
      };
      return builder;
    },

    // Minimal auth namespace for routes that sign the session out.
    auth: {
      async signOut(): Promise<{ error: null }> {
        return { error: null };
      },
    },

    async rpc(fn: string, params: any): Promise<SupaStubResponse> {
      calls.rpc.push({ fn, params });
      const response = rpcConfig[fn];
      if (response) {
        return response;
      }
      // Default: return 0
      return { data: 0, error: null };
    },
  };
}
