import { {{capitalisedName}}List } from 'views/{{view}}/list';
import { {{capitalisedName}}Detail } from 'views/{{view}}/detail';

const Routes = [
  {
    path: '/{{view}}s',
    view: {{capitalisedName}}List,
    layout: 'app',
    permission: 'user',
    title: '{{view}}.list.title'
  },
  {
    path: '/{{view}}s/:id',
    view: {{capitalisedName}}Detail,
    layout: 'app',
    permission: 'user',
    title: '{{view}}.detail.title'
  }
]

export default Routes;
