/***
*
*   {{capitalisedName}} Detail
*
**********/

import { useContext, useState, useEffect, useCallback } from 'react';
import { AuthContext, ViewContext, Animate, Card, Detail,useAPI, useParams } from 'components/lib';

export function {{capitalisedName}}Detail({ t }){

  const { id } = useParams();

  // context
  const viewContext = useContext(ViewContext);
  const authContext = useContext(AuthContext);

  // state
  const [{{view}}, set{{capitalisedName}}] = useState([]);

  // fetch
  const fetch = useAPI(`/api/{{view}}/${id}`);

  // init
  useEffect(() => {

    if (fetch?.data?.length)
      set{{capitalisedName}}(fetch.data[0]);
 
  }, [fetch]);

  return (
    <Animate>
      <Card title={ t('{{view}}.detail.title') } loading={ fetch.loading }>

        <Detail data={ {{view}} } />

      </Card> 
    </Animate>
  );
}
