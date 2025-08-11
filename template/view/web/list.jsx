/***
*
*   {{capitalisedName}} List
*
**********/

import { useContext, useState, useEffect, useCallback } from 'react';
import { AuthContext, ViewContext, Animate, Card, Table, Alert, useAPI } from 'components/lib';

export function {{capitalisedName}}List({ t }){

  // context
  const viewContext = useContext(ViewContext);
  const authContext = useContext(AuthContext);

  // state
  const [{{view}}s, set{{capitalisedName}}s] = useState([]);

  // fetch
  const fetch = useAPI('/api/{{view}}');

  // init
  useEffect(() => {

    if (fetch?.data?.length)
      set{{capitalisedName}}s(fetch.data);
 
  }, [fetch]);

  const create{{capitalisedName}} = useCallback(() => {

    viewContext.dialog.open({

      title: t('{{view}}.list.create.title'),
      description: t('{{view}}.list.create.description'),
      form: { 
        inputs: {
          name: { type: 'text', label: t('{{view}}.list.create.inputs.name.label') }
        },
        buttonText: t('{{view}}.list.create.button'),
        url: `/api/{{view}}`, 
        method: 'POST' 
      }
    });
  }, []);

  const edit{{capitalisedName}} = useCallback(({ row, editRowCallback }) => {

    viewContext.dialog.open({
      title: t('{{view}}.list.edit.title'),
      description: t('{{view}}.list.edit.description'),
      form: {
        inputs: {
          name: { 
            type: 'text', 
            label: t('{{view}}.list.edit.inputs.name.label'), 
            value: row.name 
          }
        },
        buttonText: t('{{view}}.list.edit.button'),
        url: `/api/{{view}}/${row.id}`,
        method: 'PATCH',
      },
    }, () => {

      editRowCallback(row);

    });
  }, [viewContext]);

  const delete{{capitalisedName}} = useCallback(({ row, deleteRowCallback }) => {
    
    const id = Array.isArray(row) ? row.map(x => x.id) : [row.id];

    viewContext.dialog.open({
      title: id.length > 1 ? t('{{view}}.list.delete.title.plural') : t('{{view}}.list.delete.title.single'),
      description: id.length > 1 ? t('{{view}}.list.delete.description.plural') : t('{{view}}.list.delete.description.single'),
      form: { 
        inputs: {
          id: {
            type: 'hidden',
            value: id,
          }
        },
        url: '/api/{{view}}',
        destructive: true,
        method: 'DELETE',
        buttonText: t('{{view}}.list.delete.button'),
      }
    }, () => {

      const newState = deleteRowCallback(row);
      set{{capitalisedName}}s(newState);

    });
  }, [viewContext]);

  const view{{capitalisedName}} = useCallback(({ row }) => {

    return window.location = `/account/{{view}}s/${row.id}`;

  }, [viewContext]);

  return (
    <Animate>
      <Card title={ t('{{view}}.list.title') } loading={ fetch.loading }>

        { {{view}}s.length ? 
          <Table 
            selectable
            searchable
            data={ {{view}}s }
            loading={ fetch.loading }
            translation='{{view}}.list'
            show={['name']}
            actions={[

              { icon: 'edit', label: t('global.table.action.edit'), action: edit{{capitalisedName}} },
              { icon: 'trash', label: t('global.table.action.delete'), action: delete{{capitalisedName}}, global: true, color: 'red' },
              { icon: 'circle-plus', label: t('global.table.action.new'), action: create{{capitalisedName}}, color: 'green', global: true, globalOnly: true }

            ]}
          /> :

          <Alert 
            variant='info'
            title={ t('{{view}}.list.blank_slate.title') }
            description={ t('{{view}}.list.blank_slate.description') }
            button={{ 
              
              text: t('{{view}}.list.blank_slate.button'), 
              action: create{{capitalisedName}}
            
            }}
          />
        }
      </Card> 
    </Animate>
  );
}
